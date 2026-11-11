// Маленький писатель ZIP без сжатия («store») для архива «Записи набора» (v3.3.188, CONCEPT_VOICESET.md): WAV почти не сжимается, а тяжёлая библиотека ради одной кнопки отладки не нужна.
// Формат — обычный ZIP 2.0: локальные заголовки + данные, центральный каталог, конец каталога; имена в UTF-8 (флаг 0x0800), CRC-32 каждого файла; без ZIP64 (архив меньше 4 ГБ, файлов меньше 65 535).
// zipStore возвращает СПИСОК кусков (Uint8Array) — их отдают в Blob как есть, без склейки в один большой массив (память телефона). Чистые функции.
let TABLE = null
const table = () => {
  if (TABLE) return TABLE
  TABLE = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; TABLE[n] = c >>> 0 }
  return TABLE
}

/** CRC-32 (IEEE 802.3) массива байт */
export function crc32(u8) {
  const t = table()
  let c = 0xffffffff
  for (let i = 0; i < u8.length; i++) c = t[(c ^ u8[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const utf8 = s => new TextEncoder().encode(String(s))
const dos = d => ({ time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() })

/** Размер архива для файлов [{ name, size }] — деление набора на части без чтения звука */
export const zipSize = files => files.reduce((s, f) => s + 30 + 46 + 2 * utf8(f.name).length + f.size, 22)

/** files: [{ name, data: Uint8Array }] → куски архива (для new Blob(parts)) */
export function zipStore(files, { date = new Date() } = {}) {
  const parts = [], central = [], { time, date: day } = dos(date)
  let offset = 0
  for (const f of files) {
    const name = utf8(f.name), data = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data), crc = crc32(data)
    const head = new Uint8Array(30 + name.length), h = new DataView(head.buffer)
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 10, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, time, true); h.setUint16(12, day, true)
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true)
    head.set(name, 30)
    const cen = new Uint8Array(46 + name.length), c = new DataView(cen.buffer)
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 10, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, time, true); c.setUint16(14, day, true)
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true)
    cen.set(name, 46)
    parts.push(head, data); central.push(cen)
    offset += head.length + data.length
  }
  const size = central.reduce((s, x) => s + x.length, 0), end = new Uint8Array(22), e = new DataView(end.buffer)
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, offset, true)
  return [...parts, ...central, end]
}
