import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { openGameMic, closeGameMic, shutGameMic, getGameMic, isGameMicIdle, gameMicAlive, micTracksLine, parkGameMic, reopenGameMic, hasGameMic } from './gameMic.js'
import { MIC_IDLE_CLOSE_MS, MIC_REVIVE_MS, trackState, waitUnmute, onPageUnload, createIdleCloser } from './gameMicKeep.js'
import { MIC_GRANTED_KEY, readMicGrantedAt } from './micGrantFlag.js'
import { subscribeAudioLoss } from './gameAudioSignals.js'
import { createMicHold } from './gameMicHold.js'
import { MIC_HOLD_KEY } from './gameAudioSettings.js'

// v3.3.148: один поток микрофона на сеанс страницы — пауза и конец игры выключают дорожку (enabled = false), а не останавливают; getUserMedia — только если потока нет или он мёртв
const logs = vi.hoisted(() => [])
vi.mock('./debug.js', () => ({ pLog: m => logs.push(m) }))
const memStore = (init = {}) => { const m = { ...init }; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: k => { delete m[k] }, m } }
const mkStream = () => {
  const L = {}
  const t = { readyState: 'live', enabled: true, muted: false, stop() { this.readyState = 'ended' }, addEventListener: (k, h) => { (L[k] ||= []).push(h) }, removeEventListener: () => {}, getSettings: () => ({}) }
  return { t, L, getTracks: () => [t], getAudioTracks: () => [t] }
}
const stubGum = (...streams) => { const gum = vi.fn(); streams.forEach(s => gum.mockResolvedValueOnce(s)); vi.stubGlobal('navigator', { userAgent: 'x', mediaDevices: { getUserMedia: gum } }); return gum }

beforeEach(() => { logs.length = 0; vi.stubGlobal('localStorage', memStore()) })
afterEach(() => { shutGameMic(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('один поток на сеанс страницы', () => {
  it('вторая игра — без getUserMedia: конец игры выключает дорожку (поток жив), следующий старт включает', async () => {
    const s = mkStream(); const gum = stubGum(s)
    expect(await openGameMic()).toBe('granted')
    closeGameMic()
    expect(s.t.readyState).toBe('live'); expect(s.t.enabled).toBe(false); expect(isGameMicIdle()).toBe(true); expect(gameMicAlive()).toBe(true)
    expect(micTracksLine()).toBe('live/off (жив, выключен)')
    expect(await openGameMic()).toBe('granted')
    expect(gum).toHaveBeenCalledTimes(1); expect(s.t.enabled).toBe(true); expect(isGameMicIdle()).toBe(false); expect(getGameMic()).toBe(s)
    expect(logs).toContain('[mic] дорожка после фона: жива → используем')
  })

  it('пауза выключает, «Продолжить» включает тот же поток (слушатель Vosk берёт его через getGameMic)', async () => {
    const s = mkStream(); const gum = stubGum(s)
    await openGameMic(); expect(getGameMic()).toBe(s)
    closeGameMic(); expect(getGameMic()).toBeNull()
    closeGameMic() // повторная пауза — no-op
    expect(await openGameMic()).toBe('granted'); expect(getGameMic()).toBe(s); expect(gum).toHaveBeenCalledTimes(1)
  })

  it('дорожка оборвана (ended) — новый запрос; старая остановлена', async () => {
    const a = mkStream(), b = mkStream(); const gum = stubGum(a, b)
    await openGameMic(); closeGameMic()
    a.t.readyState = 'ended'
    expect(await openGameMic()).toBe('granted')
    expect(gum).toHaveBeenCalledTimes(2); expect(getGameMic()).toBe(b)
    expect(logs).toContain('[mic] дорожка после фона: оборвана → запрашиваем')
  })

  it(`простой без игры дольше MIC_IDLE_CLOSE_MS (${MIC_IDLE_CLOSE_MS / 60000} мин) закрывает поток по-настоящему; старт игры таймер снимает`, async () => {
    vi.useFakeTimers()
    const a = mkStream(), b = mkStream(); const gum = stubGum(a, b)
    await openGameMic(); closeGameMic()
    vi.advanceTimersByTime(MIC_IDLE_CLOSE_MS - 1); expect(a.t.readyState).toBe('live')
    await openGameMic(); vi.advanceTimersByTime(MIC_IDLE_CLOSE_MS * 2); expect(a.t.readyState).toBe('live') // в игре таймера нет
    closeGameMic(); vi.advanceTimersByTime(MIC_IDLE_CLOSE_MS)
    expect(a.t.readyState).toBe('ended'); expect(hasGameMic()).toBe(false); expect(micTracksLine()).toBe('нет потока')
    expect(await openGameMic()).toBe('granted'); expect(gum).toHaveBeenCalledTimes(2)
  })

  it('два тапа подряд, пока идёт запрос, — один getUserMedia', async () => {
    const s = mkStream(); let answer
    const gum = vi.fn(() => new Promise(r => { answer = r }))
    vi.stubGlobal('navigator', { userAgent: 'x', mediaDevices: { getUserMedia: gum } })
    const p1 = openGameMic(), p2 = openGameMic()
    answer(s)
    expect(await p1).toBe('granted'); expect(await p2).toBe('granted'); expect(gum).toHaveBeenCalledTimes(1)
  })

  it('успех ставит отметку «микрофон уже разрешали» в localStorage', async () => {
    stubGum(mkStream())
    expect(readMicGrantedAt()).toBeNull()
    await openGameMic()
    expect(readMicGrantedAt()).toBeGreaterThan(0); expect(localStorage.getItem(MIC_GRANTED_KEY)).toMatch(/^\d+$/)
  })

  it('настоящее закрытие (shutGameMic) во время повторного открытия: новый поток сразу закрывается', async () => {
    const first = mkStream(), late = mkStream(); let resolveGum
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValueOnce(first).mockImplementationOnce(() => new Promise(r => { resolveGum = r })) } })
    await openGameMic(); parkGameMic()
    const r = reopenGameMic()
    shutGameMic(); resolveGum(late)
    expect(await r).toBe('unavailable'); expect(late.t.readyState).toBe('ended'); expect(hasGameMic()).toBe(false)
  })
})

describe('после фона: сначала проверить старую дорожку', () => {
  it(`заглушена, но ожила за ${MIC_REVIVE_MS} мс после enabled = true — используем без запроса`, async () => {
    vi.useFakeTimers()
    const s = mkStream(); const gum = stubGum(s)
    await openGameMic(); closeGameMic()
    s.t.muted = true
    const p = openGameMic()
    expect(s.t.enabled).toBe(true) // включили, ждём
    await vi.advanceTimersByTimeAsync(200)
    s.t.muted = false; s.L.unmute?.forEach(h => h())
    expect(await p).toBe('granted'); expect(gum).toHaveBeenCalledTimes(1); expect(getGameMic()).toBe(s)
    expect(logs.some(l => l.startsWith('[mic] дорожка после фона: заглушена, ожила'))).toBe(true)
  })

  it('заглушена и не ожила — остановить и запросить заново (единственный повторный диалог)', async () => {
    vi.useFakeTimers()
    const a = mkStream(), b = mkStream(); const gum = stubGum(a, b)
    await openGameMic(); closeGameMic()
    a.t.muted = true
    const p = openGameMic()
    await vi.advanceTimersByTimeAsync(MIC_REVIVE_MS + 100)
    expect(await p).toBe('granted'); expect(gum).toHaveBeenCalledTimes(2); expect(a.t.readyState).toBe('ended'); expect(getGameMic()).toBe(b)
    expect(logs).toContain(`[mic] дорожка после фона: заглушена, не ожила за ${MIC_REVIVE_MS} мс → запрашиваем`)
  })

  it('trackState / waitUnmute: live, muted, ended, none; оборванная не ждётся', async () => {
    const s = mkStream()
    expect(trackState(s)).toBe('live'); s.t.muted = true; expect(trackState(s)).toBe('muted')
    s.t.readyState = 'ended'; expect(trackState(s)).toBe('ended'); expect(trackState(null)).toBe('none')
    expect(await waitUnmute(s, 500)).toBe(false)
  })
})

describe('сигналы, сторож, выгрузка', () => {
  it('mute / ended дорожки вне игры (на паузе) — не сигнал паузы', async () => {
    const s = mkStream(); stubGum(s)
    await openGameMic(); closeGameMic()
    const onLoss = vi.fn(), log = vi.fn()
    const off = subscribeAudioLoss(onLoss, { sinceStart: () => 1e9, isSelf: () => false, onCtx: () => () => {}, log })
    s.t.muted = true; s.L.mute.forEach(h => h()); s.t.readyState = 'ended'; s.L.ended.forEach(h => h())
    expect(onLoss).not.toHaveBeenCalled(); expect(log.mock.calls.some(c => c[0].includes('вне игры'))).toBe(true)
    off()
  })

  it('окно речи (enabled-false) не включает дорожку обратно, если игра уже выключила поток', () => {
    const t = { readyState: 'live', muted: false, enabled: true }
    let idle = false
    const hold = createMicHold({ getStream: () => ({ getTracks: () => [t] }), session: { phase() {} }, store: memStore({ [MIC_HOLD_KEY]: 'enabled-false' }), note: () => {}, setTimer: () => 1, clearTimer: () => {}, isIdle: () => idle })
    hold.begin(); expect(t.enabled).toBe(false)
    idle = true; hold.reset(); expect(t.enabled).toBe(false)
    idle = false; t.enabled = true; hold.begin(); hold.end(); expect(t.enabled).toBe(true) // следующий старт (openGameMic включил) — как раньше
  })

  it('pagehide с выгрузкой закрывает поток; страница в bfcache (persisted) — нет', () => {
    const L = {}; const win = { addEventListener: (k, h) => { L[k] = h }, removeEventListener: vi.fn() }
    const fn = vi.fn()
    const off = onPageUnload(fn, win)
    L.pagehide({ persisted: true }); expect(fn).not.toHaveBeenCalled()
    L.pagehide({ persisted: false }); expect(fn).toHaveBeenCalledTimes(1)
    off(); expect(win.removeEventListener).toHaveBeenCalled()
    expect(onPageUnload(fn, null)()).toBeUndefined()
    const src = createIdleCloser({ ms: 5, setTimer: (f) => { f(); return 1 }, clearTimer: () => {} }); const g = vi.fn(); src.arm(g); expect(g).toHaveBeenCalled()
  })
})
