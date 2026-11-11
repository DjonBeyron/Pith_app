import { describe, it, expect } from 'vitest'
import zlib from 'node:zlib'
import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { crc32, zipStore, zipSize } from './voiceSetZip.js'
import { splitParts, buildManifest, clipEntry, archiveName, PART_MAX } from './voiceSetManifest.js'
import { buildPlan } from './voiceSetPlan.js'

// ZIP «store» архива набора: CRC-32, структура, распаковка настоящим unzip; деление набора на части и манифест
const enc = s => new TextEncoder().encode(s)
const join = parts => Buffer.concat(parts.map(p => Buffer.from(p.buffer, p.byteOffset, p.byteLength)))
/** Разбор центрального каталога: [{ name, crc, size, offset, data }] */
function readZip(buf) {
  const end = buf.length - 22
  expect(buf.readUInt32LE(end)).toBe(0x06054b50)
  const n = buf.readUInt16LE(end + 10), out = []
  let o = buf.readUInt32LE(end + 16)
  for (let i = 0; i < n; i++) {
    expect(buf.readUInt32LE(o)).toBe(0x02014b50)
    const nameLen = buf.readUInt16LE(o + 28), offset = buf.readUInt32LE(o + 42), size = buf.readUInt32LE(o + 24), name = buf.toString('utf8', o + 46, o + 46 + nameLen)
    expect(buf.readUInt32LE(offset)).toBe(0x04034b50)
    const start = offset + 30 + buf.readUInt16LE(offset + 26) + buf.readUInt16LE(offset + 28)
    out.push({ name, crc: buf.readUInt32LE(o + 16), size, offset, method: buf.readUInt16LE(o + 10), data: buf.subarray(start, start + size) })
    o += 46 + nameLen
  }
  return out
}

describe('ZIP без сжатия', () => {
  it('CRC-32: известные значения и совпадение с zlib', () => {
    expect(crc32(enc(''))).toBe(0)
    expect(crc32(enc('123456789'))).toBe(0xcbf43926)
    const big = Uint8Array.from({ length: 70000 }, (_, i) => (i * 31 + 7) & 255)
    if (typeof zlib.crc32 === 'function') expect(crc32(big)).toBe(zlib.crc32(big))
  })
  it('архив: каталог, смещения, CRC и данные каждого файла; имена UTF-8; размер известен заранее', () => {
    const files = [{ name: 'manifest.json', data: enc('{"a":1}') }, { name: 'clips/001_house_whole_1.wav', data: Uint8Array.from({ length: 5000 }, (_, i) => i & 255) }, { name: 'clips/пусто.wav', data: new Uint8Array(0) }]
    const buf = join(zipStore(files, { date: new Date(2026, 10, 11, 14, 5, 30) })), got = readZip(buf)
    expect(buf).toHaveLength(zipSize(files.map(f => ({ name: f.name, size: f.data.length }))))
    expect(got.map(g => g.name)).toEqual(files.map(f => f.name))
    got.forEach((g, i) => { expect(g.method).toBe(0); expect(g.size).toBe(files[i].data.length); expect(g.crc).toBe(crc32(files[i].data)); expect(Buffer.compare(g.data, Buffer.from(files[i].data))).toBe(0) })
  })
  it('распаковывается настоящим unzip (если он есть в системе)', () => {
    let has = true
    try { execFileSync('unzip', ['-v'], { stdio: 'ignore' }) } catch { has = false }
    if (!has) return
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vszip-')), file = path.join(dir, 'a.zip')
    const wav = Uint8Array.from({ length: 40000 }, (_, i) => (i * 7) & 255)
    fs.writeFileSync(file, join(zipStore([{ name: 'manifest.json', data: enc('{"kind":"pithy-voiceset"}') }, { name: 'clips/002_milk_nolast_3.wav', data: wav }])))
    try {
      expect(execFileSync('unzip', ['-t', file]).toString()).toMatch(/No errors detected/)
      execFileSync('unzip', ['-q', file, '-d', path.join(dir, 'out')])
      expect(fs.readFileSync(path.join(dir, 'out/manifest.json'), 'utf8')).toBe('{"kind":"pithy-voiceset"}')
      expect(Buffer.compare(fs.readFileSync(path.join(dir, 'out/clips/002_milk_nolast_3.wav')), Buffer.from(wav))).toBe(0)
    } finally { fs.rmSync(dir, { recursive: true, force: true }) }
  })
})

describe('части архива и манифест', () => {
  const plan = buildPlan({ far: true })
  const stats = { ms: 2700, rmsPeak: 0.0041, rmsNoise: 0.0003, gamePeak: 0.0135, gameNoise: 0.001, voiceMs: 520, voiceOnMs: 800, voiceOffMs: 1320, zeros: 0, noVoice: false, late: false, early: false }
  const clips = plan.map(it => clipEntry(it, { ...stats, ms: it.ms + 500 }, { srcRate: 48000, sampleRate: 16000, preMs: 500, bytes: 44 + (it.ms + 500) * 32, t: 1e12 }))
  const meta = { version: '3.3.187', ua: 'UA', device: 'iPhone iOS 18.7', createdAt: '2026-11-11T10:00:00.000Z', settings: { words: ['house'], reps: 3, far: true }, micGain: 2, constraints: { echoCancellation: false }, captures: [{ t: 1, ctxRate: 48000, track: { sampleRate: 48000 } }], skipped: [4], planCount: plan.length }

  it('полный набор (283 клипа ≈ 26 МБ) — две части, каждая не больше 20 МБ, клипы по порядку и без потерь', () => {
    const parts = splitParts(clips)
    expect(parts).toHaveLength(2)
    expect(parts.flat().map(c => c.i)).toEqual(clips.map(c => c.i))
    for (const p of parts) expect(zipSize(p.map(c => ({ name: c.file, size: c.bytes }))) + 262144).toBeLessThanOrEqual(PART_MAX)
    expect(splitParts(clips.slice(0, 50))).toHaveLength(1)
    expect(splitParts([])).toEqual([])
    expect(splitParts([{ i: 0, file: 'a', bytes: 30e6 }, { i: 1, file: 'b', bytes: 10 }]).map(p => p.length)).toEqual([1, 1])
  })
  it('запись клипа: слово / фраза / id, вид, повтор, far, длина, частоты, уровни, голос, время; флаги — только у пунктов с голосом', () => {
    const w = clipEntry(plan[1], { ...stats, noVoice: true, late: true }, { srcRate: 48000, sampleRate: 16000, preMs: 500, bytes: 86444, clipped: 3, t: 1e12 })
    expect(w).toMatchObject({ i: 1, file: 'clips/002_house_whole_1.wav', kind: 'word', word: 'house', variant: 'whole', rep: 1, far: false, expect: 'hit', ms: 2700, preMs: 500, sampleRate: 16000, srcRate: 48000, rmsPeak: 0.0041, rmsNoise: 0.0003, gamePeak: 0.0135, voiceMs: 520, noVoice: true, late: true, clipped: 3, t: '2001-09-09T01:46:40.000Z' })
    expect(clipEntry(plan[0], { ...stats, noVoice: true }, { srcRate: 48000, sampleRate: 16000, preMs: 500, bytes: 1 })).not.toHaveProperty('noVoice')
    expect(clipEntry(plan.find(x => x.kind === 'noise'), { ...stats, late: true, noVoice: true }, { srcRate: 48000, sampleRate: 16000, preMs: 500, bytes: 1 })).toMatchObject({ id: 'cough', noVoice: true }) // кашель: «без голоса» — да,
    expect(clipEntry(plan.find(x => x.kind === 'noise'), { ...stats, late: true }, { srcRate: 48000, sampleRate: 16000, preMs: 500, bytes: 1 })).not.toHaveProperty('late') // «не уместилось» — только про слова и фразы
    expect(clipEntry(plan[0], stats, { srcRate: 48000, sampleRate: 16000, preMs: 500, bytes: 1 }).id).toBe('silence')
    expect(clipEntry(plan.find(x => x.kind === 'phrase'), stats, { srcRate: 44100, sampleRate: 16000, preMs: 500, bytes: 1 })).toMatchObject({ phrase: 'See you later', srcRate: 44100 })
    expect(clips.at(-1).far).toBe(true)
  })
  it('манифест части: версия, устройство, дата, настройки дорожки, частота контекста, часть из N, только свои клипы', () => {
    const parts = splitParts(clips), m = buildManifest({ meta, clips: parts[1], part: 2, parts: 2, total: clips.length, now: new Date('2026-11-11T12:00:00Z') })
    expect(m).toMatchObject({ kind: 'pithy-voiceset', v: 1, version: '3.3.187', device: 'iPhone iOS 18.7', ua: 'UA', exportedAt: '2026-11-11T12:00:00.000Z', part: 2, parts: 2, clipsInSet: 283, planCount: 283, skipped: [4], track: { sampleRate: 48000 } })
    expect(m.audio).toMatchObject({ sampleRate: 16000, contextRate: 48000, preMs: 500, micGain: 2 })
    expect(m.clips).toBe(parts[1])
    expect(JSON.parse(JSON.stringify(m)).clips).toHaveLength(parts[1].length)
    expect(archiveName(new Date(2026, 10, 11, 14, 5), 2, 2)).toBe('pithy-voiceset-2026-11-11_14-05-part2of2.zip')
    expect(archiveName(new Date(2026, 10, 11, 14, 5))).toBe('pithy-voiceset-2026-11-11_14-05.zip')
  })
})
