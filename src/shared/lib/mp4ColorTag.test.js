import { describe, it, expect } from 'vitest'
import { tagMp4Color, tagMp4ColorFile } from './mp4ColorTag.js'

// Сборщик синтетических MP4: атом = [размер(4)][тип(4)][тело]
const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const str = s => [...s].map(c => c.charCodeAt(0))
const box = (type, ...body) => { const b = body.flat(); return [...u32(8 + b.length), ...str(type), ...b] }
const full = (type, ...body) => box(type, [0, 0, 0, 0], ...body) // версия+флаги

// Видеозапись avc1: 78 байт полей + дочерние атомы (avcC, при желании colr)
const avc1 = (...children) => box('avc1', new Array(78).fill(0), box('avcC', [1, 77, 0, 31, 0xff, 0xe0]), ...children)
const colr = box('colr', str('nclx'), [0, 1, 0, 1, 0, 1, 0])
const trak = (entry, chunkOffsets) => box('trak',
  box('mdia', box('minf', box('stbl',
    full('stsd', u32(1), entry),
    full('stco', u32(chunkOffsets.length), ...chunkOffsets.map(u32)),
  ))),
)
const ftyp = box('ftyp', str('isom'), u32(0), str('isomavc1'))

// Разбор результата: найти атом по пути и прочитать его поля
function boxes(bytes, start = 0, end = bytes.length) {
  const dv = new DataView(bytes.buffer ?? bytes)
  const out = []
  for (let p = start; p + 8 <= end;) {
    const size = dv.getUint32(p)
    const type = String.fromCharCode(...new Uint8Array(dv.buffer, p + 4, 4))
    out.push({ type, start: p, size })
    if (size < 8) break
    p += size
  }
  return out
}
const u8 = buf => new Uint8Array(buf)
const stcoValues = (buf) => {
  const b = u8(buf)
  const dv = new DataView(buf)
  const vals = []
  for (let i = 0; i + 4 <= b.length; i++) {
    if (b[i] === 0x73 && b[i + 1] === 0x74 && b[i + 2] === 0x63 && b[i + 3] === 0x6f) {
      const count = dv.getUint32(i + 8)
      for (let k = 0; k < count; k++) vals.push(dv.getUint32(i + 12 + k * 4))
    }
  }
  return vals
}
const countColr = buf => { const b = u8(buf); let n = 0; for (let i = 0; i + 4 <= b.length; i++) if (b[i] === 0x63 && b[i + 1] === 0x6f && b[i + 2] === 0x6c && b[i + 3] === 0x72) n++; return n }

// Файл: ftyp, затем moov и mdat в заданном порядке; stco указывает на
// реальные байты-маркеры внутри mdat
function makeFile({ moovFirst = true, tracks = 1, withColr = false } = {}) {
  const data = [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]
  const build = offsets => {
    const traks = Array.from({ length: tracks }, (_, t) => trak(withColr ? avc1(colr) : avc1(), [offsets[t]]))
    return box('moov', full('mvhd', new Array(96).fill(0)), ...traks)
  }
  const mdat = box('mdat', data)
  // Смещения зависят от размера moov — считаем в два прохода
  const moovSize = build(new Array(tracks).fill(0)).length
  const mdatStart = moovFirst ? ftyp.length + moovSize : ftyp.length
  const offsets = Array.from({ length: tracks }, (_, t) => mdatStart + 8 + t)
  const moov = build(offsets)
  const bytes = moovFirst ? [...ftyp, ...moov, ...mdat] : [...ftyp, ...mdat, ...moov]
  return { buf: new Uint8Array(bytes).buffer, offsets, data }
}

describe('метка цвета в MP4', () => {
  it('добавляет colr BT.709 limited в видеодорожку', () => {
    const { buf } = makeFile()
    const res = tagMp4Color(buf)
    expect(res.changed).toBe(true)
    expect(res.buf.byteLength).toBe(buf.byteLength + 19)
    const b = u8(res.buf)
    const i = b.findIndex((_, k) => b[k] === 0x6e && b[k + 1] === 0x63 && b[k + 2] === 0x6c && b[k + 3] === 0x78) // 'nclx'
    expect([...b.subarray(i + 4, i + 11)]).toEqual([0, 1, 0, 1, 0, 1, 0]) // BT.709 ×3, limited
  })

  it('moov перед данными: смещения кусков сдвигаются и указывают на те же байты', () => {
    const { buf, data } = makeFile({ moovFirst: true })
    const res = tagMp4Color(buf)
    const [off] = stcoValues(res.buf)
    expect(u8(res.buf)[off]).toBe(data[0]) // тот же байт данных, что и до вставки
  })

  it('moov после данных: смещения не трогаются', () => {
    const { buf, offsets } = makeFile({ moovFirst: false })
    const res = tagMp4Color(buf)
    expect(res.changed).toBe(true)
    expect(stcoValues(res.buf)).toEqual(offsets)
  })

  it('две дорожки: обе размечены, размеры всех атомов сходятся', () => {
    const { buf, data } = makeFile({ tracks: 2 })
    const res = tagMp4Color(buf)
    expect(countColr(res.buf)).toBe(2)
    expect(res.buf.byteLength).toBe(buf.byteLength + 38)
    // Верхний уровень читается подряд без дыр: ftyp, moov, mdat
    const top = boxes(u8(res.buf))
    expect(top.map(b => b.type)).toEqual(['ftyp', 'moov', 'mdat'])
    expect(top.reduce((s, b) => s + b.size, 0)).toBe(res.buf.byteLength)
    const offs = stcoValues(res.buf)
    expect(offs.map(o => u8(res.buf)[o])).toEqual([data[0], data[1]])
  })

  it('метка уже есть — файл не трогаем (повторная загрузка безопасна)', () => {
    const { buf } = makeFile({ withColr: true })
    const res = tagMp4Color(buf)
    expect(res.changed).toBe(false)
    expect(res.reason).toMatch(/уже есть/)
    const twice = tagMp4Color(tagMp4Color(makeFile().buf).buf)
    expect(twice.changed).toBe(false)
  })

  it('обёртка для загрузки: MP4 получает метку, остальное уходит как есть', async () => {
    const mp4 = new File([makeFile().buf], 'clip.mp4', { type: 'video/mp4' })
    const res = await tagMp4ColorFile(mp4)
    expect(res.file).not.toBe(mp4)
    expect(res.file.size).toBe(mp4.size + 19)
    expect(res.file.name).toBe('clip.mp4')
    expect(res.file.type).toBe('video/mp4')
    const png = new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', { type: 'image/png' })
    expect((await tagMp4ColorFile(png)).file).toBe(png)
    // Битый «mp4» — загрузка не ломается, уходит исходный файл
    const broken = new File([new Uint8Array([0, 0, 0, 3, 1])], 'x.mp4', { type: 'video/mp4' })
    expect((await tagMp4ColorFile(broken)).file).toBe(broken)
  })

  it('фрагменты с абсолютными смещениями и не-MP4 — не трогаем', () => {
    const { buf } = makeFile()
    const tfhd = full('tfhd', u32(1)) // флаг base-data-offset
    tfhd[11] = 1
    const frag = [...u8(buf), ...box('moof', box('traf', tfhd))]
    expect(tagMp4Color(new Uint8Array(frag).buffer).changed).toBe(false)
    expect(tagMp4Color(new Uint8Array(box('RIFF', [1, 2, 3])).buffer).reason).toBe('не MP4')
  })
})
