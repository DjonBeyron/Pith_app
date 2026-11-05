import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const state = { muted: false, web: true }
vi.mock('../player/lessonVolume.js', () => ({ getLessonMuted: () => state.muted }))
vi.mock('../../shared/lib/gameAudioCtx.js', () => ({ webAudioOn: () => state.web, getGameCtx: () => fakeCtx }))
vi.mock('../../shared/lib/gameBufferPlay.js', () => ({ playGameBuffer: vi.fn(() => true) }))

const made = []
const fakeCtx = { sampleRate: 44100, createBuffer: (ch, len, rate) => { const data = new Float32Array(len); const b = { len, rate, data, copyToChannel: d => data.set(d), getChannelData: () => data }; made.push(b); return b } }
const { synthTap, tapBuffer, dropTapBuffer, playChargeTap, TAP_HZ, TAP_MS, TAP_ATTACK_MS, TAP_DB, TAP_RMS } = await import('./raceChargeTap.js')
const { COUNT_RMS, COUNT_PEAK } = await import('../rehearsal/rehearsalCountdownSynth.js')

// Тихий звук удара слова о бар в заставке (CONCEPT_RACE.md): синус 880 Гц, 40 мс, −18 дБ, атака 5 мс, на каждое касание через playGameBuffer; буфер синтезируется один раз; lite тоже играет.
const rmsOf = a => Math.sqrt([...a].reduce((s, v) => s + v * v, 0) / a.length)
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')

describe('звук касания бара: синтез', () => {
  it('880 Гц, 40 мс, атака 5 мс, −18 дБ от нот отсчёта, пик не выше COUNT_PEAK', () => {
    expect([TAP_HZ, TAP_MS, TAP_ATTACK_MS, TAP_DB]).toEqual([880, 40, 5, -18])
    const a = synthTap(44100)
    expect(a.length).toBe(Math.floor(44100 * 0.04))
    expect(rmsOf(a)).toBeCloseTo(TAP_RMS, 4); expect(TAP_RMS / COUNT_RMS).toBeCloseTo(10 ** (-18 / 20), 5); expect(Math.max(...[...a].map(Math.abs))).toBeLessThanOrEqual(COUNT_PEAK)
    let cross = 0; for (let i = 1; i < a.length; i++) if (a[i - 1] <= 0 && a[i] > 0) cross++
    expect(cross).toBeGreaterThanOrEqual(34); expect(cross).toBeLessThanOrEqual(36) // 40 мс × 880 Гц ≈ 35 периодов
  })
  it('мягкая атака: первые отсчёты тихие, нарастание до 5 мс; затухание к нулю', () => {
    const a = synthTap(48000), att = Math.floor(48000 * 0.005)
    expect(Math.abs(a[1])).toBeLessThan(Math.max(...[...a].map(Math.abs)) * 0.05)
    const early = Math.max(...[...a.slice(0, att)].map(Math.abs)), mid = Math.max(...[...a.slice(att, att * 3)].map(Math.abs))
    expect(early).toBeLessThanOrEqual(mid + 1e-9); expect(Math.abs(a[a.length - 1])).toBeLessThan(0.003)
  })
  it('буфер синтезируется один раз на частоту и переиспользуется; сбой создания — null', () => {
    dropTapBuffer(); made.length = 0
    const b1 = tapBuffer(fakeCtx), b2 = tapBuffer(fakeCtx)
    expect(b1).toBe(b2); expect(made).toHaveLength(1)
    dropTapBuffer(); tapBuffer(fakeCtx); expect(made).toHaveLength(2)
    expect(tapBuffer({ sampleRate: 48000, createBuffer: () => { throw new Error('x') } })).toBeNull()
  })
})

describe('звук касания бара: когда играет', () => {
  it('через игровой плеер; «без звука» урока и нет Web Audio — тишина; на слабом устройстве и при reduced-motion условий нет — звук играет', () => {
    const play = vi.fn(() => true)
    expect(playChargeTap({ play })).toBe(true); expect(play).toHaveBeenCalledTimes(1); expect(play.mock.calls[0][1]).toEqual({ gain: 1 })
    state.muted = true; expect(playChargeTap({ play })).toBe(false); state.muted = false
    state.web = false; expect(playChargeTap({ play })).toBe(false); state.web = true
    expect(read('./raceChargeTap.js').replace(/\/\/.*$/gm, '')).not.toMatch(/isWeakDevice|reducedMotion|lite/)
  })
  it('в заставке — на каждый сегмент бара (момент касания), раньше возврата при reduced-motion: звук не зависит от графики', () => {
    const src = read('./RaceCharge.jsx')
    expect(src).toContain('segments.forEach(s => at(s.at, () => {'); expect(src.indexOf('playChargeTap()')).toBeLessThan(src.indexOf('if (still || !ring?.animate) return'))
  })
})
