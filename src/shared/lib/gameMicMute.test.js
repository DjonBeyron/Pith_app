import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { openGameMic, closeGameMic, shutGameMic, getGameMic } from './gameMic.js'
import { MIC_REVIVE_MS, micMuted, onMicMuted, markMicMuted } from './gameMicKeep.js'
import { subscribeAudioLoss, MUTE_WAIT_MS, GRACE_MS } from './gameAudioSignals.js'

// v3.3.165: система глушит дорожку посреди игры (iOS: mute на 1–2 с) — это НЕ пауза, пока mute ≤ MUTE_WAIT_MS; «микрофон временно глух» — micMuted / onMicMuted для сцены;
// после фона заглушённая дорожка ждёт unmute до MIC_REVIVE_MS (1,5 с), не ожила — новый getUserMedia.
const logs = vi.hoisted(() => [])
vi.mock('./debug.js', () => ({ pLog: m => logs.push(m) }))
const mkStream = () => {
  const L = {}
  const t = { readyState: 'live', enabled: true, muted: false, stop() { this.readyState = 'ended' }, addEventListener: (k, h) => { (L[k] ||= []).push(h) }, removeEventListener: () => {}, getSettings: () => ({}) }
  const emit = k => (L[k] || []).forEach(h => h())
  return { t, L, emit, getTracks: () => [t], getAudioTracks: () => [t] }
}
const stubGum = (...streams) => { const gum = vi.fn(); streams.forEach(s => gum.mockResolvedValueOnce(s)); vi.stubGlobal('navigator', { userAgent: 'x', mediaDevices: { getUserMedia: gum } }); return gum }
const memStore = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: k => { delete m[k] } } }

beforeEach(() => { logs.length = 0; vi.useFakeTimers(); vi.stubGlobal('localStorage', memStore()) })
afterEach(() => { shutGameMic(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('mute системы посреди игры — не пауза', () => {
  const signals = (since = 1e9) => {
    const onLoss = vi.fn(), log = vi.fn()
    const off = subscribeAudioLoss(onLoss, { sinceStart: () => since, isSelf: () => false, onCtx: () => () => {}, log })
    return { onLoss, log, off }
  }
  it(`mute ожил за 2 с (< ${MUTE_WAIT_MS} мс) — паузы нет, сигнал снят, micMuted true→false, журнал «[mic] глух N мс (система)»`, async () => {
    const s = mkStream(); stubGum(s); await openGameMic()
    const seen = []; const offM = onMicMuted((m, i) => seen.push([m, i.ms]))
    const t = signals()
    s.t.muted = true; s.emit('mute')
    expect(micMuted()).toBe(true)
    vi.advanceTimersByTime(2000); expect(t.onLoss).not.toHaveBeenCalled()
    s.t.muted = false; s.emit('unmute')
    expect(micMuted()).toBe(false)
    vi.advanceTimersByTime(MUTE_WAIT_MS * 2); expect(t.onLoss).not.toHaveBeenCalled()
    expect(seen[0]).toEqual([true, 0]); expect(seen[1][0]).toBe(false)
    expect(logs.some(l => /^\[mic\] глух \d+ мс \(система\)$/.test(l))).toBe(true)
    expect(t.log.mock.calls.some(c => c[0].includes('дорожка ожила через') && c[0].includes('без паузы'))).toBe(true)
    t.off(); offM()
  })
  it(`mute держится дольше ${MUTE_WAIT_MS} мс — пауза mic-mute; раньше — нет`, async () => {
    const s = mkStream(); stubGum(s); await openGameMic()
    const t = signals()
    s.t.muted = true; s.emit('mute')
    vi.advanceTimersByTime(MUTE_WAIT_MS - 1); expect(t.onLoss).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1); expect(t.onLoss).toHaveBeenCalledWith('mic-mute')
    t.off()
  })
  it('ended — пауза сразу (как раньше); mute в окне старта (GRACE_MS) всё равно ждётся, а не забывается', async () => {
    const s = mkStream(); stubGum(s); await openGameMic()
    const g = signals(GRACE_MS - 100)
    s.t.muted = true; s.emit('mute'); vi.advanceTimersByTime(MUTE_WAIT_MS)
    expect(g.onLoss).toHaveBeenCalledWith('mic-mute'); g.off()
    const e = signals(); s.t.readyState = 'ended'; s.emit('ended'); expect(e.onLoss).toHaveBeenCalledWith('mic-ended'); e.off()
  })
  it('markMicMuted: повтор состояния — no-op, подписчик с ошибкой не мешает, отписка работает', () => {
    const bad = onMicMuted(() => { throw new Error('x') }); const cb = vi.fn(); const off = onMicMuted(cb)
    markMicMuted(true, { now: 100 }); markMicMuted(true, { now: 200 })
    const log = vi.fn(); markMicMuted(false, { now: 350, log })
    expect(cb.mock.calls).toEqual([[true, { ms: 0 }], [false, { ms: 250 }]]); expect(log).toHaveBeenCalledWith('[mic] глух 250 мс (система)')
    off(); bad(); markMicMuted(true); markMicMuted(false); expect(cb).toHaveBeenCalledTimes(2)
  })
  it('поток закрыт, пока дорожка глуха — глухота снимается (сцена не висит замороженной)', async () => {
    const s = mkStream(); stubGum(s); await openGameMic()
    s.t.muted = true; s.emit('mute'); expect(micMuted()).toBe(true)
    shutGameMic('тест'); expect(micMuted()).toBe(false)
    expect(logs.some(l => l.startsWith('[mic] глух') && l.includes('поток закрыт'))).toBe(true)
  })
})

describe('после фона: live/muted — ждём unmute до 1,5 с, иначе перезапрос', () => {
  it(`MIC_REVIVE_MS = 1500; ожила за 1200 мс — тот же поток, журнал «live/muted → ждём unmute … → ожила за N мс»`, async () => {
    expect(MIC_REVIVE_MS).toBe(1500)
    const s = mkStream(); const gum = stubGum(s)
    await openGameMic(); closeGameMic()
    s.t.muted = true
    const p = openGameMic()
    await vi.advanceTimersByTimeAsync(1200)
    s.t.muted = false; s.emit('unmute')
    expect(await p).toBe('granted'); expect(gum).toHaveBeenCalledTimes(1); expect(getGameMic()).toBe(s)
    expect(logs.find(l => l.includes('ждём unmute'))).toMatch(/^\[mic\] дорожка после фона: live\/muted → ждём unmute до 1500 мс → ожила за \d+ мс → используем$/)
  })
  it('не ожила за 1,5 с — старый поток остановлен, новый getUserMedia', async () => {
    const a = mkStream(), b = mkStream(); const gum = stubGum(a, b)
    await openGameMic(); closeGameMic()
    a.t.muted = true
    const p = openGameMic()
    await vi.advanceTimersByTimeAsync(1000); expect(gum).toHaveBeenCalledTimes(1) // 500 мс прежнего порога уже не хватает для перезапроса
    await vi.advanceTimersByTimeAsync(600)
    expect(await p).toBe('granted'); expect(gum).toHaveBeenCalledTimes(2); expect(a.t.readyState).toBe('ended'); expect(getGameMic()).toBe(b)
    expect(logs).toContain('[mic] дорожка после фона: live/muted → ждём unmute до 1500 мс → не ожила → запрашиваем')
  })
})
