import { describe, it, expect, vi } from 'vitest'
import { nudgeVolume, autoNudgeAfterMic, readNudgeMode, writeNudgeMode, silentWavUrl, testToneBuffer, NUDGE_MODES, VOLUME_NUDGE_KEY } from './gameVolumeNudge.js'

// «Встряска громкости»: способы дёрнуть вывод iPhone, не трогая микрофон; настройка автозапуска; тест-звук.
const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k), m } }
function rig({ state = 'running', type = 'play-and-record', support = true } = {}) {
  const calls = []
  const ctx = { state, suspend: vi.fn(async () => { calls.push('suspend'); ctx.state = 'suspended' }), resume: vi.fn(async () => { calls.push('resume'); ctx.state = 'running' }) }
  let cur = type
  const session = { supported: () => support, current: () => (support ? cur : null), set: t => { calls.push(`type:${t}`); cur = t; return true } }
  const audio = { play: vi.fn(async () => { calls.push('audio'); audio.onended?.() }), pause: vi.fn() }
  return { calls, deps: { ctx: () => ctx, session, audio: () => audio, sleep: async () => {}, log: vi.fn() }, ctx, session }
}

describe('встряска громкости', () => {
  it('ctx: suspend → resume, только пока контекст running; иначе пропуск', async () => {
    const r = rig()
    expect((await nudgeVolume('ctx', r.deps)).ok).toBe(true)
    expect(r.calls).toEqual(['suspend', 'resume'])
    const off = rig({ state: 'suspended' })
    const res = await nudgeVolume('ctx', off.deps)
    expect(res.ok).toBe(false); expect(off.calls).toEqual([]); expect(res.steps[0]).toContain('пропуск')
  })
  it('session: тип уходит в auto и возвращается; playback — так же; тот же тип — пропуск; нет API — не падает', async () => {
    const r = rig()
    await nudgeVolume('session', r.deps)
    expect(r.calls).toEqual(['type:auto', 'type:play-and-record'])
    const p = rig()
    await nudgeVolume('playback', p.deps)
    expect(p.calls).toEqual(['type:playback', 'type:play-and-record'])
    const same = rig({ type: 'auto' })
    expect((await nudgeVolume('session', same.deps)).ok).toBe(false); expect(same.calls).toEqual([])
    const none = rig({ support: false })
    expect((await nudgeVolume('session', none.deps)).steps[0]).toContain('нет API')
  })
  it('media: беззвучный <audio> играется и останавливается; all — все три по порядку; неизвестный способ и ошибки не бросают', async () => {
    const r = rig()
    expect((await nudgeVolume('media', r.deps)).ok).toBe(true); expect(r.calls).toEqual(['audio'])
    const all = rig()
    const res = await nudgeVolume('all', all.deps)
    expect(all.calls).toEqual(['suspend', 'resume', 'type:auto', 'type:play-and-record', 'audio']); expect(res.ok).toBe(true)
    expect((await nudgeVolume('что-то', rig().deps)).ok).toBe(false)
    const bad = rig(); bad.ctx.suspend = vi.fn(() => { throw new Error('boom') })
    expect((await nudgeVolume('ctx', bad.deps)).steps.join()).toContain('boom')
    expect(r.deps.log).toHaveBeenCalled()
  })
  it('настройка: по умолчанию off, незнакомое значение = off, off стирает ключ; автозапуск — только не off', () => {
    const st = mem()
    expect(readNudgeMode(st)).toBe('off')
    writeNudgeMode('ctx', st); expect(readNudgeMode(st)).toBe('ctx')
    st.setItem(VOLUME_NUDGE_KEY, 'мусор'); expect(readNudgeMode(st)).toBe('off')
    writeNudgeMode('off', st); expect(st.m.has(VOLUME_NUDGE_KEY)).toBe(false)
    expect(NUDGE_MODES[0]).toBe('off')
    const timers = []
    expect(autoNudgeAfterMic({ mode: () => 'off', setTimer: f => timers.push(f) })).toBe(false); expect(timers).toHaveLength(0)
    const r = rig()
    expect(autoNudgeAfterMic({ ...r.deps, mode: () => 'ctx', setTimer: f => timers.push(f) })).toBe(true); expect(timers).toHaveLength(1)
  })
  it('тест-звук: три тона в моно-буфере, амплитуда 0,18; беззвучный WAV — data-URL', () => {
    const data = new Float32Array(66150)
    const ctx = { sampleRate: 44100, createBuffer: (n, len) => ({ getChannelData: () => data.subarray(0, len) }) }
    const buf = testToneBuffer(ctx)
    const peak = Math.max(...buf.getChannelData(0).map(Math.abs))
    expect(peak).toBeGreaterThan(0.15); expect(peak).toBeLessThanOrEqual(0.18 + 1e-6)
    expect(testToneBuffer(null)).toBe(null)
    expect(silentWavUrl(100).startsWith('data:audio/wav;base64,UklGR')).toBe(true)
  })
})
