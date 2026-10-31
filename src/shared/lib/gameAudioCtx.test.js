import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { webAudioOn, getGameCtx, gameCtxState, unlockGameCtx, onGameCtxInterrupted, closeGameCtx } from './gameAudioCtx.js'
import { makeFakeWebAudio } from './fakeWebAudio.js'
import { createAudioWarm } from './gameAudioWarm.js'

// Игровой AudioContext: создаётся лениво, открывается в жесте (resume + тихий отсчёт), прерывание iOS доходит до подписчиков, закрытый заменяется новым; аварийный выключатель pithy_game_web_audio_v1
let fake
const store = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) } }
beforeEach(() => { fake = makeFakeWebAudio({ state: 'suspended' }); vi.stubGlobal('AudioContext', fake.Ctx); vi.stubGlobal('localStorage', store()) })
afterEach(() => { closeGameCtx(); vi.unstubAllGlobals() })

describe('игровой AudioContext', () => {
  it('нет Web Audio → webAudioOn() false, контекста нет; аварийный выключатель off тоже выключает', () => {
    vi.stubGlobal('AudioContext', undefined)
    expect(webAudioOn()).toBe(false)
    expect(getGameCtx()).toBeNull()
    vi.stubGlobal('AudioContext', fake.Ctx)
    expect(webAudioOn()).toBe(true)
    localStorage.setItem('pithy_game_web_audio_v1', 'off')
    expect(webAudioOn()).toBe(false)
    expect(getGameCtx()).toBeNull()
  })

  it('контекст один на игру: повторные обращения возвращают тот же; ленивое создание — пока не просили, его нет', () => {
    expect(gameCtxState()).toBeNull()
    const a = getGameCtx()
    expect(getGameCtx()).toBe(a)
    expect(fake.ctxs).toHaveLength(1)
    expect(gameCtxState()).toBe('suspended')
  })

  it('unlockGameCtx (в жесте): создаёт, resume() и тихий отсчёт в 1 кадр; итог — состояние', async () => {
    const p = unlockGameCtx()
    expect(fake.ctxs[0].resumes).toBe(1) // resume() вызван СИНХРОННО, до первого await — иначе iOS его не засчитает жестом
    expect(fake.sources).toHaveLength(1) // отсчёт тишины запущен
    expect(await p).toBe('running')
    expect(await unlockGameCtx()).toBe('running') // уже running — resume() не повторяется
    expect(fake.ctxs[0].resumes).toBe(1)
  })

  it('resume() отклонён — итог: текущее состояние, исключения нет', async () => {
    fake.resumeMode = 'reject'
    expect(await unlockGameCtx()).toBe('suspended')
  })

  it('прерывание (state → interrupted) доходит до подписчиков; отписка работает; закрытый контекст заменяется новым', () => {
    const cb = vi.fn()
    const off = onGameCtxInterrupted(cb)
    const c = getGameCtx()
    c.setState('running')
    expect(cb).not.toHaveBeenCalled()
    c.setState('interrupted')
    expect(cb).toHaveBeenCalledTimes(1)
    off(); c.setState('interrupted')
    expect(cb).toHaveBeenCalledTimes(1)
    c.setState('closed')
    expect(getGameCtx()).not.toBe(c)
    expect(fake.ctxs).toHaveLength(2)
  })

  it('closeGameCtx закрывает контекст, следующий getGameCtx создаёт новый', () => {
    const c = getGameCtx()
    closeGameCtx()
    expect(c.closed).toBe(true)
    expect(gameCtxState()).toBeNull()
    expect(getGameCtx()).not.toBe(c)
  })
})

describe('gameAudioWarm смотрит на игровой контекст', () => {
  it('по умолчанию: игровой контекст interrupted → settle резюмит именно его; прерывание уже в игре запускает повторный прогрев', async () => {
    vi.useFakeTimers()
    const warm = createAudioWarm({ now: () => Date.now(), doc: null, note: () => {}, log: () => {}, active: () => true, sessionState: () => 'active' })
    getGameCtx().setState('running')
    warm.begin()
    const rewarm = vi.fn()
    warm.onRewarm(rewarm)
    getGameCtx().setState('interrupted') // iOS: смена типа сессии
    let done = null
    warm.settle().then(r => { done = r })
    await vi.advanceTimersByTimeAsync(400)
    expect(fake.ctxs[0].resumes).toBeGreaterThan(0) // settle подтолкнул resume() игровому контексту
    await vi.advanceTimersByTimeAsync(900)
    expect(done).toMatchObject({ ctx: 'running' })
    getGameCtx().setState('interrupted') // прерывание уже в игре
    await vi.advanceTimersByTimeAsync(400)
    expect(rewarm).toHaveBeenCalled()
    warm.end()
    vi.useRealTimers()
  })
})
