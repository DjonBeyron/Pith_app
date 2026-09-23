import { tagSpsColor } from './h264Sps.js'

// Метка цвета в MP4 перед загрузкой: «BT.709, limited range».
//
// Зачем: на части Android (Mali-G72, Android 10, Chrome 150) любое видео
// сначала показывалось нормально, а через миг вся картинка «в дымке» —
// светлее и бледнее; касание (пауза) дымку убирало. В наших файлах НЕТ ни
// одной метки цвета. iPhone и компьютеры считают такие кадры видео-диапазоном
// 16–235 — всё верно; аппаратный декодер части Android — полным 0–255:
// чёрное становится серым, белое тускнеет — «дымка».
//
// Метка ставится в два места:
//   • атом colr (nclx) в описании дорожки — его читают браузеры;
//   • video_signal_type в VUI заголовка SPS (h264Sps.js) — и в описании
//     дорожки (avcC), и в повторах SPS внутри потока перед ключевыми кадрами.
//     Одного colr (3.2.1718) Android не хватило: аппаратный декодер смотрит в
//     поток. Повторы SPS тоже надо править — иначе на первом ключевом кадре
//     декодер перечитал бы заголовок «без метки».
// Кадры не перекодируются. Механизм — список правок «заменить байты
// [start, end) на новые» с цепочкой атомов-владельцев: после сборки
// пересчитываются размеры атомов, размеры кадров (stsz) и смещения кусков
// данных (stco/co64). Рискованные файлы (mfra, фрагменты с абсолютными
// смещениями) не трогаем; уже размеченное не трогаем.

const COLR = [0, 0, 0, 19, 0x63, 0x6f, 0x6c, 0x72, 0x6e, 0x63, 0x6c, 0x78, 0, 1, 0, 1, 0, 1, 0]
const VIDEO_ENTRIES = ['avc1', 'avc3', 'hvc1', 'hev1']
const CONTAINERS = ['moov', 'trak', 'mdia', 'minf', 'stbl', 'moof', 'traf', 'mfra', 'edts', 'dinf']

function parse(dv, start, end) {
  const out = []
  let p = start
  while (p + 8 <= end) {
    let size = dv.getUint32(p)
    let hdr = 8
    if (size === 1) { size = Number(dv.getBigUint64(p + 8)); hdr = 16 }
    else if (size === 0) size = end - p
    if (size < hdr || p + size > end) break
    const type = String.fromCharCode(dv.getUint8(p + 4), dv.getUint8(p + 5), dv.getUint8(p + 6), dv.getUint8(p + 7))
    const box = { type, start: p, size, hdr, children: [] }
    if (CONTAINERS.includes(type)) box.children = parse(dv, p + hdr, p + size)
    if (type === 'stsd') box.children = parse(dv, p + hdr + 8, p + size)
    if (VIDEO_ENTRIES.includes(type)) box.children = parse(dv, p + hdr + 78, p + size)
    out.push(box)
    p += size
  }
  return out
}

const find = (boxes, type) => boxes.filter(b => b.type === type)
const child = (b, type) => b && find(b.children, type)[0]
const walk = (boxes, fn) => boxes.forEach(b => { fn(b); walk(b.children, fn) })
const lenBytes = (n, size) => Array.from({ length: size }, (_, i) => (n >>> (8 * (size - 1 - i))) & 255)

// Позиция и размер каждого кадра дорожки (по stsz/stsc/stco|co64)
function samples(dv, stbl) {
  const stsz = child(stbl, 'stsz'); const stsc = child(stbl, 'stsc'); const co = child(stbl, 'stco') || child(stbl, 'co64')
  if (!stsz || !stsc || !co || dv.getUint32(stsz.start + 12) !== 0) return null // единый размер кадра — не наш случай
  const count = dv.getUint32(stsz.start + 16)
  const chunks = Array.from({ length: dv.getUint32(co.start + 12) }, (_, i) => co.type === 'stco'
    ? dv.getUint32(co.start + 16 + i * 4) : Number(dv.getBigUint64(co.start + 16 + i * 8)))
  const runs = Array.from({ length: dv.getUint32(stsc.start + 12) }, (_, i) => ({ first: dv.getUint32(stsc.start + 16 + i * 12), per: dv.getUint32(stsc.start + 20 + i * 12) }))
  const out = []
  for (let c = 0; c < chunks.length && out.length < count; c++) {
    const run = [...runs].reverse().find(r => r.first <= c + 1)
    let p = chunks[c]
    for (let k = 0; k < (run?.per || 0) && out.length < count; k++) {
      const size = dv.getUint32(stsz.start + 20 + out.length * 4)
      out.push({ pos: p, size, entry: stsz.start + 20 + out.length * 4 })
      p += size
    }
  }
  return out
}

export function tagMp4Color(buf) {
  const dv = new DataView(buf)
  const src = new Uint8Array(buf)
  const top = parse(dv, 0, buf.byteLength)
  if (!top.length || top[0].type !== 'ftyp') return { buf, changed: false, reason: 'не MP4' }
  const moov = find(top, 'moov')[0]
  if (!moov) return { buf, changed: false, reason: 'нет moov' }
  if (find(top, 'mfra').length) return { buf, changed: false, reason: 'есть mfra (абсолютные смещения)' }
  let absFragments = false
  walk(find(top, 'moof'), b => { if (b.type === 'tfhd' && (dv.getUint32(b.start + 8) & 1)) absFragments = true })
  if (absFragments) return { buf, changed: false, reason: 'фрагменты с абсолютными смещениями' }
  const fragmented = find(top, 'moof').length > 0

  const edits = [] // { start, end, bytes, chain }
  const sizeFixes = [] // { entry (позиция в stsz), size }
  const stat = { colr: 0, spsHead: 0, spsStream: 0, marked: 0 }
  for (const trak of find(moov.children, 'trak')) {
    const mdia = child(trak, 'mdia'); const minf = child(mdia, 'minf'); const stbl = child(minf, 'stbl'); const stsd = child(stbl, 'stsd')
    const entry = stsd && stsd.children.find(b => VIDEO_ENTRIES.includes(b.type))
    if (!entry) continue
    const chain = [moov, trak, mdia, minf, stbl, stsd, entry]
    if (child(entry, 'colr')) stat.marked++
    else { edits.push({ start: entry.start + entry.size, end: entry.start + entry.size, bytes: COLR, chain }); stat.colr++ }

    const avcC = child(entry, 'avcC')
    if (!avcC) continue
    const p = avcC.start + 8
    const nalLen = (src[p + 4] & 3) + 1
    let q = p + 6
    for (let i = 0; i < (src[p + 5] & 0x1f); i++) {
      const len = dv.getUint16(q)
      const fixed = tagSpsColor(src.subarray(q + 2, q + 2 + len))
      if (fixed) { edits.push({ start: q, end: q + 2 + len, bytes: [...lenBytes(fixed.length, 2), ...fixed], chain: [...chain, avcC] }); stat.spsHead++ }
      q += 2 + len
    }
    // Повторы SPS внутри потока (перед ключевыми кадрами)
    const list = fragmented ? null : samples(dv, stbl)
    for (const s of list || []) {
      const mdat = find(top, 'mdat').find(m => m.start < s.pos && s.pos + s.size <= m.start + m.size)
      if (!mdat) continue
      let delta = 0
      for (let r = s.pos; r + nalLen < s.pos + s.size;) {
        let len = 0
        for (let k = 0; k < nalLen; k++) len = len * 256 + src[r + k]
        if ((src[r + nalLen] & 0x1f) === 7) {
          const fixed = tagSpsColor(src.subarray(r + nalLen, r + nalLen + len))
          if (fixed) {
            edits.push({ start: r, end: r + nalLen + len, bytes: [...lenBytes(fixed.length, nalLen), ...fixed], chain: [mdat] })
            delta += fixed.length - len
            stat.spsStream++
          }
        }
        r += nalLen + len
      }
      if (delta) sizeFixes.push({ entry: s.entry, size: s.size + delta })
    }
  }
  if (!edits.length) return { buf, changed: false, reason: stat.marked ? 'метка цвета уже есть' : 'нет видеодорожки H.264/HEVC' }

  // Сборка нового файла
  edits.sort((a, b) => a.start - b.start || a.end - b.end)
  const delta = e => e.bytes.length - (e.end - e.start)
  const mapPos = old => old + edits.reduce((s, e) => s + (e.end <= old ? delta(e) : 0), 0)
  const out = new Uint8Array(src.length + edits.reduce((s, e) => s + delta(e), 0))
  let from = 0
  let to = 0
  for (const e of edits) {
    out.set(src.subarray(from, e.start), to); to += e.start - from
    out.set(e.bytes, to); to += e.bytes.length
    from = e.end
  }
  out.set(src.subarray(from), to)
  const ndv = new DataView(out.buffer)

  // Размеры атомов-владельцев правок
  const grown = new Map()
  for (const e of edits) for (const b of e.chain) grown.set(b, (grown.get(b) || 0) + delta(e))
  for (const [b, add] of grown) {
    const at = mapPos(b.start)
    if (b.hdr === 16) ndv.setBigUint64(at + 8, BigInt(b.size + add))
    else ndv.setUint32(at, b.size + add)
  }
  // Размеры кадров с изменённым SPS
  for (const f of sizeFixes) ndv.setUint32(mapPos(f.entry), f.size)
  // Смещения кусков данных всех дорожек
  walk([moov], b => {
    if (b.type !== 'stco' && b.type !== 'co64') return
    const at = mapPos(b.start)
    for (let k = 0; k < ndv.getUint32(at + 12); k++) {
      if (b.type === 'stco') { const p = at + 16 + k * 4; ndv.setUint32(p, mapPos(ndv.getUint32(p))) }
      else { const p = at + 16 + k * 8; ndv.setBigUint64(p, BigInt(mapPos(Number(ndv.getBigUint64(p))))) }
    }
  })
  return { buf: out.buffer, changed: true, reason: `метка BT.709 limited: colr ${stat.colr}, SPS в описании ${stat.spsHead}, SPS в потоке ${stat.spsStream}` }
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
