import { describe, it, expect, vi } from 'vitest'
import { measureLoudness, measureNudge, ROOM_MS, TONE_MS, STEP_MS } from './gameVolumeProbe.js'

// Замер громкости микрофоном игры: фон комнаты → тест-звук → уровень в дБ; сверка ДО / ПОСЛЕ встряски.
function rig({ toneRms = [0.02], room = 0.002, state = 'running', live = true } = {}) {
  let playing = false, phase = 0
  const track = { readyState: live ? 'live' : 'ended', enabled: false }
  const stream = { getAudioTracks: () => [track] }
  const an = { fftSize: 2048, getFloatTimeDomainData: arr => { const v = playing ? toneRms[Math.min(phase++, toneRms.length - 1)] : room; arr.fill(v) } }
  const ctx = { state, sampleRate: 44100, createBuffer: (n, len) => ({ getChannelData: () => new Float32Array(len) }), createMediaStreamSource: () => ({ connect: vi.fn(), disconnect: vi.fn() }), createAnalyser: () => an }
  return { track, deps: { stream: () => stream, ctx: () => ctx, play: () => { playing = true; return true }, sleep: async () => {} } }
}

describe('замер громкости микрофоном', () => {
  it('тон над фоном в дБ; дорожка микрофона на время замера включается и возвращается', async () => {
    const r = rig()
    const res = await measureLoudness(r.deps)
    expect(res.ok).toBe(true)
    expect(res.toneDb).toBeCloseTo(-34, 0)  // 0.02 → −34 dBFS
    expect(res.roomDb).toBeCloseTo(-54, 0)  // 0.002 → −54 dBFS
    expect(res.overDb).toBeCloseTo(20, 0)
    expect(r.track.enabled).toBe(false)
    expect(ROOM_MS / STEP_MS + TONE_MS / STEP_MS).toBeGreaterThan(40)
  })
  it('нет микрофона / контекст не running — замер не выходит с причиной', async () => {
    expect((await measureLoudness(rig({ live: false }).deps)).why).toContain('микрофон')
    expect((await measureLoudness(rig({ state: 'suspended' }).deps)).why).toContain('suspended')
  })
  it('до / после встряски: разница в дБ и вердикт в журнале (встряска делает тон вдвое громче → +6 дБ)', async () => {
    const log = vi.fn()
    let amp = 0.01
    const r = rig()
    const ctx = { ...r.deps.ctx(), createAnalyser: () => ({ fftSize: 2048, getFloatTimeDomainData: arr => arr.fill(playing ? amp : 0.002) }) }
    let playing = false
    const deps = {
      ...r.deps, ctx: () => ctx, log, play: () => { playing = true; return true },
      nudge: { session: { supported: () => true, current: () => 'play-and-record', set: t => { if (t === 'play-and-record') amp = 0.02; return true } }, ctx: () => null, audio: () => null, sleep: async () => {}, log: () => {} },
    }
    const res = await measureNudge('session', deps)
    expect(res.diffDb).toBeCloseTo(6, 0)
    expect(res.text).toContain('ГРОМЧЕ')
    expect(log.mock.calls.at(-1)[0]).toContain('[audio] замер громкости (по микрофону)')
  })
  it('замер до встряски не вышел — встряска не делается, причина в журнале', async () => {
    const log = vi.fn()
    const res = await measureNudge('playback', { ...rig({ live: false }).deps, log })
    expect(res.after).toBe(null); expect(res.text).toContain('замер не вышел')
    expect(log.mock.calls[0][0]).toContain('[audio] замер громкости')
  })
})
