import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'

// v3.3.147: blur от НАШЕГО диалога доступа к микрофону — не пауза (журнал владельца: «[page] blur» через 53 мс после getUserMedia → пауза закрыла сессию и поток посреди «Продолжить»).
// hidden / pagehide / freeze — по-прежнему пауза. И хук паузы: флаг «игра смонтирована», исходы tapAgain / dead перезапуска.
const fx = vi.hoisted(() => ({ cleanup: null }))
vi.mock('react', async orig => ({
  ...(await orig()),
  useCallback: fn => fn,
  useEffect: fn => { const c = fn(); if (typeof c === 'function') fx.cleanup = c },
  useRef: init => ({ current: init }),
  useState: init => { const box = [typeof init === 'function' ? init() : init]; return [box[0], v => { box[0] = typeof v === 'function' ? v(box[0]) : v }] },
}))
vi.mock('./wordLaneStart.js', () => ({ startGameAudio: vi.fn() }))
const logs = vi.hoisted(() => [])
vi.mock('../../../../shared/lib/debug.js', () => ({ pLog: (...a) => logs.push(a.join(' ')) }))

const { subscribePauseEvents, BLUR_CONFIRM_MS } = await import('./wordLanePauseEvents.js')
const { useWordLanePause } = await import('./useWordLanePause.js')
const { gameMounted } = await import('../../../../shared/lib/gameAudioLife.js')
const { gameMicGesture } = await import('../../../../shared/lib/gameMicGesture.js')

beforeEach(() => { vi.useFakeTimers(); logs.length = 0 })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

function env(over = {}) {
  const docL = {}, winL = {}
  const doc = { visibilityState: 'visible', hasFocus: () => false, addEventListener: (t, h) => { docL[t] = h }, removeEventListener: t => { delete docL[t] }, ...over }
  const win = { addEventListener: (t, h) => { winL[t] = h }, removeEventListener: t => { delete winL[t] } }
  return { doc, win, docL, winL }
}

describe('subscribePauseEvents: blur во время запроса микрофона', () => {
  it('blur, пока getUserMedia ждёт ответа, — не пауза, журнал «[pause] blur во время запроса микрофона — не пауза»', () => {
    const e = env(), on = vi.fn()
    subscribePauseEvents(on, { ...e, micBusy: () => true })
    e.winL.blur(); vi.advanceTimersByTime(BLUR_CONFIRM_MS * 4)
    expect(on).not.toHaveBeenCalled()
    expect(logs).toContain('[pause] blur во время запроса микрофона — не пауза')
  })
  it('запрос начался уже после blur (ответ ещё в окне 1,5 с к моменту подтверждения) — тоже не пауза; без запроса — пауза', () => {
    let busy = false
    const e = env(), on = vi.fn()
    subscribePauseEvents(on, { ...e, micBusy: () => busy })
    e.winL.blur(); busy = true; vi.advanceTimersByTime(BLUR_CONFIRM_MS)
    expect(on).not.toHaveBeenCalled()
    busy = false; e.winL.blur(); vi.advanceTimersByTime(BLUR_CONFIRM_MS)
    expect(on).toHaveBeenCalledWith('blur')
  })
  it('hidden, pagehide, freeze во время запроса — пауза как раньше; blur с уже hidden — тоже', () => {
    const e = env(), on = vi.fn()
    subscribePauseEvents(on, { ...e, micBusy: () => true })
    e.doc.visibilityState = 'hidden'; e.docL.visibilitychange(); expect(on).toHaveBeenLastCalledWith('hidden')
    e.winL.pagehide(); expect(on).toHaveBeenLastCalledWith('pagehide')
    e.docL.freeze(); expect(on).toHaveBeenLastCalledWith('freeze')
  })
})

describe('useWordLanePause: игра смонтирована, исходы перезапуска', () => {
  function setup(result) {
    const e = env()
    vi.stubGlobal('document', e.doc); vi.stubGlobal('window', e.win)
    const f = { paused: true, pausedIntro: false, pause: vi.fn(() => true), restartStage: vi.fn(), dbg: { event: vi.fn() } }
    const hook = useWordLanePause({ f, cfg: {}, audioSrc: null, lines: null, restart: () => Promise.resolve(result), isVoice: () => true })
    return { f, hook }
  }
  it('пока хук смонтирован — gameMounted(); размонтирование снимает', () => {
    setup({ ok: true, mic: 'granted' })
    expect(gameMounted()).toBe(true)
    fx.cleanup(); expect(gameMounted()).toBe(false)
  })
  it('tapAgain (жест истёк до микрофона) — пауза остаётся, ступень не идёт; dead — пауза «sound-dead»', async () => {
    vi.useRealTimers()
    const a = setup({ ok: false, tapAgain: true, mic: 'skipped' })
    a.hook.resume(); await new Promise(r => setTimeout(r, 0))
    expect(a.f.pause).toHaveBeenCalledWith('tap-again'); expect(a.f.restartStage).not.toHaveBeenCalled()
    expect(logs.some(l => l.includes('жест истёк до открытия микрофона'))).toBe(true)
    const b = setup({ ok: false, dead: true, mic: 'skipped', failed: 'вывод мёртв' })
    b.hook.resume(); await new Promise(r => setTimeout(r, 0))
    expect(b.f.pause).toHaveBeenCalledWith('sound-dead'); expect(b.f.restartStage).not.toHaveBeenCalled()
    fx.cleanup()
  })
})

describe('один поток микрофона на сеанс (v3.3.148)', () => {
  it('v3.3.148: пауза выключает дорожку (поток жив, индикатор может гореть), «Продолжить» включает её без getUserMedia; оборвалась в фоне — новый запрос', async () => {
    const t = { readyState: 'live', muted: false, enabled: true, stop() { this.readyState = 'ended' }, getSettings: () => ({}) }
    const gum = vi.fn().mockResolvedValueOnce({ getTracks: () => [t] }).mockResolvedValueOnce({ getTracks: () => [{ ...t, readyState: 'live' }] })
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: gum } })
    const mic = await vi.importActual('../../../../shared/lib/gameMic.js')
    expect(await mic.openGameMic()).toBe('granted')
    mic.closeGameMic(); gameMicGesture.require() // пауза (useWordLaneControls.pause)
    expect(t.readyState).toBe('live'); expect(t.enabled).toBe(false); expect(mic.getGameMic()).toBeNull()
    expect(await mic.openGameMic()).toBe('granted'); expect(gum).toHaveBeenCalledTimes(1); expect(t.enabled).toBe(true) // тап «Продолжить»
    mic.closeGameMic(); t.readyState = 'ended'
    expect(await mic.openGameMic()).toBe('granted'); expect(gum).toHaveBeenCalledTimes(2)
    mic.shutGameMic()
    expect(readFileSync(new URL('./useWordLaneControls.js', import.meta.url), 'utf8')).toContain('микрофон выключен (поток жив) — включится только по тапу «Продолжить»')
  })
})
