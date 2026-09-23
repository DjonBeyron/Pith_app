// Метка цвета в MP4 перед загрузкой (атом colr/nclx: BT.709, limited range).
//
// Зачем: на части Android (Mali-G72, Android 10, Chrome 150) любое видео
// сначала показывалось нормально, а через миг вся картинка «в дымке» —
// светлее и бледнее; касание (пауза) дымку убирало. В наших файлах НЕТ ни
// одной метки цвета: ни атома colr, ни video_signal_type в VUI H.264
// (проверено разбором двух видео ленты). iPhone и компьютеры по умолчанию
// считают такие кадры видео-диапазоном 16–235 (BT.709 limited) — всё верно.
// Аппаратный декодер части Android считает их полным диапазоном 0–255:
// чёрное (16) становится серым, белое тускнеет — это и есть «дымка».
// Заставка и кадр на паузе рисуются другим путём — поэтому они нормальные.
//
// Лечение без перекодирования: в описание видеодорожки (avc1/hvc1 внутри
// stsd) дописываем colr nclx с явным BT.709 limited — сами кадры не
// меняются ни на бит. Размеры всех родительских атомов увеличиваются, а
// смещения кусков данных (stco/co64) сдвигаются, если данные лежат после
// moov (faststart). Файлы, которые трогать рискованно (фрагментированные с
// абсолютными смещениями, mfra), и уже размеченные — не трогаем.

const COLR = new Uint8Array([
  0, 0, 0, 19, 0x63, 0x6f, 0x6c, 0x72, // size 19, 'colr'
  0x6e, 0x63, 0x6c, 0x78, // 'nclx'
  0, 1, // colour_primaries: BT.709
  0, 1, // transfer_characteristics: BT.709
  0, 1, // matrix_coefficients: BT.709
  0, // full_range_flag = 0 (limited), reserved = 0
])
const VIDEO_ENTRIES = ['avc1', 'avc3', 'hvc1', 'hev1']
// Атомы-контейнеры: дети начинаются сразу после заголовка
const CONTAINERS = ['moov', 'trak', 'mdia', 'minf', 'stbl', 'moof', 'traf', 'mfra', 'edts', 'dinf']

const typeAt = (dv, p) => String.fromCharCode(dv.getUint8(p + 4), dv.getUint8(p + 5), dv.getUint8(p + 6), dv.getUint8(p + 7))

// Атомы в диапазоне [start, end): { type, start, size, hdr, children }
function parse(dv, start, end) {
  const out = []
  let p = start
  while (p + 8 <= end) {
    let size = dv.getUint32(p)
    let hdr = 8
    if (size === 1) { size = Number(dv.getBigUint64(p + 8)); hdr = 16 }
    else if (size === 0) size = end - p
    if (size < hdr || p + size > end) break
    const type = typeAt(dv, p)
    const box = { type, start: p, size, hdr, children: [] }
    if (CONTAINERS.includes(type)) box.children = parse(dv, p + hdr, p + size)
    // stsd: полный атом (4 байта версия/флаги) + 4 байта числа записей
    if (type === 'stsd') box.children = parse(dv, p + hdr + 8, p + size)
    // Визуальная запись образца: 78 байт полей перед дочерними атомами
    if (VIDEO_ENTRIES.includes(type)) box.children = parse(dv, p + hdr + 78, p + size)
    out.push(box)
    p += size
  }
  return out
}

const find = (boxes, type) => boxes.filter(b => b.type === type)
const walk = (boxes, fn, chain = []) => boxes.forEach(b => { fn(b, chain); walk(b.children, fn, [...chain, b]) })

// buf: ArrayBuffer файла. Возвращает { buf, changed, reason }
export function tagMp4Color(buf) {
  const dv = new DataView(buf)
  const top = parse(dv, 0, buf.byteLength)
  if (!top.length || top[0].type !== 'ftyp') return { buf, changed: false, reason: 'не MP4' }
  const moov = find(top, 'moov')[0]
  if (!moov) return { buf, changed: false, reason: 'нет moov' }
  if (moov.hdr !== 8) return { buf, changed: false, reason: '64-битный moov — не трогаем' }
  if (find(top, 'mfra').length) return { buf, changed: false, reason: 'есть mfra (абсолютные смещения)' }

  // Фрагментированный файл: безопасно, только если смещения в фрагментах
  // считаются от moof (флаг base-data-offset в tfhd не стоит)
  let absFragments = false
  walk(find(top, 'moof'), b => {
    if (b.type === 'tfhd' && (dv.getUint32(b.start + 8) & 0x000001)) absFragments = true
  })
  if (absFragments) return { buf, changed: false, reason: 'фрагменты с абсолютными смещениями' }

  // Куда вставлять: в конец каждой видеозаписи без colr
  const inserts = [] // { pos, chain } — chain: все предки вставки, включая саму запись
  let already = 0
  walk([moov], (b, chain) => {
    if (!VIDEO_ENTRIES.includes(b.type)) return
    if (b.hdr !== 8 || chain.some(c => c.hdr !== 8)) return
    if (find(b.children, 'colr').length) { already++; return }
    inserts.push({ pos: b.start + b.size, chain: [...chain, b] })
  })
  if (!inserts.length) {
    return { buf, changed: false, reason: already ? 'метка цвета уже есть' : 'нет видеодорожки H.264/HEVC' }
  }

  // Новый файл: исходные байты со вставками
  const len = COLR.length
  const shift = oldPos => inserts.filter(i => i.pos <= oldPos).length * len
  const out = new Uint8Array(buf.byteLength + inserts.length * len)
  const src = new Uint8Array(buf)
  let from = 0
  let to = 0
  for (const i of [...inserts].sort((a, b) => a.pos - b.pos)) {
    out.set(src.subarray(from, i.pos), to)
    to += i.pos - from
    out.set(COLR, to)
    to += len
    from = i.pos
  }
  out.set(src.subarray(from), to)
  const ndv = new DataView(out.buffer)

  // Размеры предков: каждый растёт на число вставок внутри него
  const grown = new Map()
  for (const i of inserts) for (const b of i.chain) grown.set(b, (grown.get(b) || 0) + len)
  for (const [b, add] of grown) ndv.setUint32(b.start + shift(b.start), b.size + add)

  // Смещения кусков данных — абсолютные от начала файла: сдвигаем на число
  // вставок, стоящих раньше данных (при faststart — все вставки)
  walk([moov], b => {
    if (b.type !== 'stco' && b.type !== 'co64') return
    const at = b.start + shift(b.start)
    const count = ndv.getUint32(at + 12)
    for (let k = 0; k < count; k++) {
      if (b.type === 'stco') {
        const p = at + 16 + k * 4
        const o = ndv.getUint32(p)
        ndv.setUint32(p, o + shift(o))
      } else {
        const p = at + 16 + k * 8
        const o = Number(ndv.getBigUint64(p))
        ndv.setBigUint64(p, BigInt(o + shift(o)))
      }
    }
  })
  return { buf: out.buffer, changed: true, reason: `добавлена метка BT.709 limited (${inserts.length} дорожк.)` }
}

// Обёртка для загрузки: File → File с меткой (или исходный, если не нужно
// или не вышло — загрузку это не должно ломать никогда)
export async function tagMp4ColorFile(file) {
  const isMp4 = /\.(mp4|m4v|mov)$/i.test(file.name || '') || /^video\/(mp4|quicktime)/i.test(file.type || '')
  if (!isMp4) return { file, reason: 'не видео MP4' }
  try {
    const res = tagMp4Color(await file.arrayBuffer())
    if (!res.changed) return { file, reason: res.reason }
    return { file: new File([res.buf], file.name, { type: file.type || 'video/mp4' }), reason: res.reason }
  } catch (e) {
    return { file, reason: `ошибка разбора: ${e?.message || e}` }
  }
}
