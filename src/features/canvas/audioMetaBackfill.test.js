import { describe, it, expect } from 'vitest'
import { nodesNeedingAudioMeta, buildAudioMetaPatch, hasAudioMeta } from './audioMetaBackfill.js'

const node = (id, type, data, seq = 1) => ({ id, seq, type, typeData: { [type]: data } })
const WAVE = [10, 200, 50]
const files = [
  { id: 'f1', status: 'synced', r2Url: 'https://r2.example/f1.mp3' },
  { id: 'f2', status: 'local',  r2Url: null, localFile: { name: 'local.mp3' } },
  { id: 'f3', status: 'synced', r2Url: null },
]

describe('nodesNeedingAudioMeta', () => {
  it('голосовое с файлом и без меты — в список, с url из файлов урока', () => {
    const out = nodesNeedingAudioMeta([node('a', 'audio', { file_id: 'f1' })], files)
    expect(out).toEqual([{ nodeId: 'a', seq: 1, fileId: 'f1', url: 'https://r2.example/f1.mp3', localFile: null }])
  })

  it('ноды без файла и voice_record — пропускаются', () => {
    const out = nodesNeedingAudioMeta([
      node('a', 'audio', {}),
      node('b', 'audio', { file_id: null }),
      node('c', 'voice_record', { file_id: 'f1' }),
      node('d', 'video', { file_id: 'f1' }),
    ], files)
    expect(out).toEqual([])
  })

  it('полная мета — не нужна; частичная (только волна или только длительность) — нужна', () => {
    const full    = node('a', 'audio', { file_id: 'f1', waveformData: WAVE, duration: 2.5 })
    const noDur   = node('b', 'audio', { file_id: 'f1', waveformData: WAVE })
    const noWave  = node('c', 'audio', { file_id: 'f1', duration: 2.5, waveformData: [] })
    const zeroDur = node('d', 'audio', { file_id: 'f1', waveformData: WAVE, duration: 0 })
    const ids = nodesNeedingAudioMeta([full, noDur, noWave, zeroDur], files).map(i => i.nodeId)
    expect(ids).toEqual(['b', 'c', 'd'])
  })

  it('локальный (ещё не загруженный) файл — отдаётся как localFile без url', () => {
    const out = nodesNeedingAudioMeta([node('a', 'audio', { file_id: 'f2' })], files)
    expect(out[0]).toMatchObject({ fileId: 'f2', url: null, localFile: { name: 'local.mp3' } })
  })

  it('без r2Url в файлах берёт r2Url, вписанный в ноду при прошлом сохранении', () => {
    const out = nodesNeedingAudioMeta([node('a', 'audio', { file_id: 'f3', r2Url: 'https://r2.example/old.mp3' })], files)
    expect(out[0].url).toBe('https://r2.example/old.mp3')
  })

  it('файл неизвестен или url не http(s) — ноду пропускаем (нечего качать)', () => {
    const out = nodesNeedingAudioMeta([
      node('a', 'audio', { file_id: 'f3' }),
      node('b', 'audio', { file_id: 'nope' }),
      node('c', 'audio', { file_id: 'f3', r2Url: 'blob:abc' }),
    ], files)
    expect(out).toEqual([])
  })

  it('порядок — по номеру ноды', () => {
    const out = nodesNeedingAudioMeta([
      node('z', 'audio', { file_id: 'f1' }, 7),
      node('y', 'audio', { file_id: 'f1' }, 2),
    ], files)
    expect(out.map(i => i.nodeId)).toEqual(['y', 'z'])
  })
})

describe('buildAudioMetaPatch', () => {
  it('дописывает только недостающее', () => {
    expect(buildAudioMetaPatch({ duration: 3 }, { waveformData: WAVE, duration: 2 })).toEqual({ waveformData: WAVE })
    expect(buildAudioMetaPatch({ waveformData: WAVE }, { waveformData: [1], duration: 2 })).toEqual({ duration: 2 })
    expect(buildAudioMetaPatch({}, { waveformData: WAVE, duration: 2 })).toEqual({ waveformData: WAVE, duration: 2 })
  })

  it('пустая волна или null-длительность (таймаут probe) не пишутся', () => {
    expect(buildAudioMetaPatch({}, { waveformData: [], duration: null })).toEqual({})
    expect(hasAudioMeta({ waveformData: WAVE, duration: NaN })).toBe(false)
  })
})
