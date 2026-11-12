import { describe, it, expect, vi } from 'vitest'
import { LAB_ROWS, playLabRow, ratingsLine } from './gameVolumeLab.js'
import { toneSamples, wavUrlOf } from './gameVolumeNudge.js'

// Стенд громкости: каждая строка готовит своё состояние (микрофон, сессия, дорожка) и играет один и тот же тест-звук.
function rig({ micLive = false } = {}) {
  const calls = []
  const track = { readyState: 'live', enabled: true }
  let stream = micLive ? { getAudioTracks: () => [track] } : null
  const ctx = { state: 'running', sampleRate: 44100, createBuffer: (n, len) => ({ getChannelData: () => new Float32Array(len) }) }
  let type = 'auto'
  const session = { supported: () => true, current: () => type, set: t => { calls.push(`type:${t}`); type = t; return true } }
  const deps = {
    closeMic: vi.fn(() => { calls.push('close'); stream = null }),
    openMic: vi.fn(async () => { calls.push('open'); stream = { getAudioTracks: () => [track] }; return 'granted' }),
    mic: () => stream, unlock: vi.fn(), ctx: () => ctx, session, sleep: async () => {}, log: vi.fn(),
    play: vi.fn(() => { calls.push(`play(track=${track.enabled})`); return true }),
    audio: vi.fn(() => ({ play: vi.fn(async () => { calls.push('audio-play') }) })),
  }
  return { deps, calls, track }
}

describe('стенд громкости', () => {
  it('A: микрофон закрывается, сессия auto, играет Web Audio', async () => {
    const r = rig({ micLive: true })
    const res = await playLabRow('A', r.deps)
    expect(res.ok).toBe(true)
    expect(r.calls).toEqual(['close', 'type:auto', 'play(track=true)'])
  })
  it('C: микрофон открывается (первым делом), тип play-and-record, потом звук', async () => {
    const r = rig()
    await playLabRow('C', r.deps)
    expect(r.calls).toEqual(['open', 'type:play-and-record', 'play(track=true)'])
  })
  it('D: дорожка выключена на время звука и возвращается', async () => {
    const r = rig({ micLive: true })
    await playLabRow('D', r.deps)
    expect(r.calls.at(-1)).toBe('play(track=false)')
    expect(r.track.enabled).toBe(true)
  })
  it('E: перед звуком playback на миг; F: через <audio>; G: playback и возврат типа', async () => {
    const e = rig({ micLive: true })
    await playLabRow('E', e.deps)
    expect(e.calls).toEqual(['type:play-and-record', 'type:playback', 'type:play-and-record', 'play(track=true)'])
    const f = rig({ micLive: true })
    await playLabRow('F', f.deps)
    expect(f.calls).toContain('audio-play'); expect(f.deps.play).not.toHaveBeenCalled()
    const g = rig({ micLive: true })
    await playLabRow('G', g.deps)
    expect(g.calls).toEqual(['type:playback', 'play(track=true)', 'type:play-and-record'])
  })
  it('микрофон не открылся / нет такой строки — не падает, причина в шагах; журнал пишется', async () => {
    const r = rig(); r.deps.openMic = vi.fn(async () => 'denied')
    const res = await playLabRow('C', r.deps)
    expect(res.ok).toBe(false); expect(res.steps.join()).toContain('denied')
    expect(r.deps.log.mock.calls[0][0]).toContain('[audio] стенд громкости: строка C')
    expect((await playLabRow('Z', r.deps)).ok).toBe(false)
  })
  it('голос Пита вместо тона: играет его буфер (Web Audio) и его адрес (<audio>)', async () => {
    const buffer = { duration: 3.5 }
    const c = rig({ micLive: true })
    const res = await playLabRow('C', { ...c.deps, sound: { buffer, url: 'https://r2/pit.mp3' } })
    expect(c.deps.play).toHaveBeenCalledWith(buffer)
    expect(res.steps.join()).toContain('голос Пита')
    const f = rig({ micLive: true })
    await playLabRow('F', { ...f.deps, sound: { buffer, url: 'https://r2/pit.mp3' } })
    expect(f.deps.audio).toHaveBeenCalledWith('https://r2/pit.mp3')
  })
  it('оценки → строка журнала; тон и WAV', () => {
    expect(ratingsLine({ A: 'норм', C: 'тихо' })).toBe('A=норм B=— C=тихо D=— E=— F=— G=—')
    expect(LAB_ROWS).toHaveLength(7)
    const s = toneSamples(22050)
    expect(s.length).toBe(33075)
    expect(Math.max(...s)).toBeGreaterThan(0.15)
    expect(wavUrlOf(s, 22050).startsWith('data:audio/wav;base64,UklGR')).toBe(true)
  })
})
