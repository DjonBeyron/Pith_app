import { describe, it, expect, vi, afterEach } from 'vitest'
import { probeCtx, waitCtxRunning, PROBE_MS } from './gameAudioCheck.js'

// Пробный тихий звук после перезапуска: доиграл и время контекста сдвинулось — рендер идёт; 'running' без движения времени (iOS после фона) — провал. Ожидание running: statechange.
function ctx({ state = 'running', ends = true, advance = true } = {}) {
  const c = {
    state, currentTime: 2, sampleRate: 44100, destination: {}, listeners: {},
    createBuffer: (ch, len, rate) => ({ ch, len, rate }),
    createBufferSource() { return { connect() {}, disconnect() {}, start() { if (ends) setTimeout(() => { if (advance) c.currentTime += 0.05; this.onended?.() }, 60) } } },
    addEventListener(t, h) { this.listeners[t] = h }, removeEventListener(t) { delete this.listeners[t] }, resume: () => Promise.resolve(),
  }
  return c
}
afterEach(() => vi.useRealTimers())

describe('probeCtx', () => {
  it('источник доиграл и время пошло — ok', async () => {
    vi.useFakeTimers()
    const p = probeCtx(ctx(), { now: () => Date.now() }); await vi.advanceTimersByTimeAsync(100)
    expect(await p).toMatchObject({ ok: true, advanced: true })
  })
  it('onended пришёл, а currentTime стоит — «время контекста стоит»', async () => {
    vi.useFakeTimers()
    const p = probeCtx(ctx({ advance: false }), { now: () => Date.now() }); await vi.advanceTimersByTimeAsync(100)
    expect(await p).toMatchObject({ ok: false, why: 'время контекста стоит' })
  })
  it('источник не доиграл за PROBE_MS — провал с состоянием', async () => {
    vi.useFakeTimers()
    const p = probeCtx(ctx({ ends: false }), { now: () => Date.now() }); await vi.advanceTimersByTimeAsync(PROBE_MS + 10)
    expect((await p).why).toMatch(/не доиграл за 1500 мс \(контекст running\)/)
  })
  it('контекст не running — сразу провал; нет контекста — ok (нечего проверять)', async () => {
    expect(await probeCtx(ctx({ state: 'interrupted' }))).toMatchObject({ ok: false, why: 'контекст interrupted' })
    expect((await probeCtx(null)).ok).toBe(true)
  })
})

describe('waitCtxRunning', () => {
  it('statechange → running отвечает сразу, не дожидаясь следующей попытки', async () => {
    vi.useFakeTimers()
    const c = ctx({ state: 'interrupted' }); c.resume = () => new Promise(() => {})
    const p = waitCtxRunning(() => c, { retryMs: 1000, maxMs: 5000, now: () => Date.now() })
    c.state = 'running'; c.listeners.statechange()
    const r = await p
    expect(r.state).toBe('running'); expect(r.tries).toBe(1)
  })
  it('уже running — без resume; нет контекста — null', async () => {
    expect(await waitCtxRunning(() => ctx())).toMatchObject({ state: 'running', tries: 0 })
    expect((await waitCtxRunning(() => null)).state).toBeNull()
  })
})
