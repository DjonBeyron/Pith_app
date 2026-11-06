import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'

// Пауза при сворачивании (v3.3.115, пункт 8): любой из сигналов hidden / pagehide / freeze / blur (iOS при блокировке экрана иногда не шлёт hidden) ставит паузу ОДИН раз за уход; пауза помечает звук
// «подозрительным» (needsRewake) — «Продолжить» идёт полным путём startGameAudio со свежим AudioContext. Хуки React выполняются «как есть».
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
const { needsRewake, consumeRewake } = await import('../../../../shared/lib/gameAudioLife.js')

beforeEach(() => { vi.useFakeTimers(); logs.length = 0; consumeRewake() })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

function env(over = {}) {
  const docL = {}, winL = {}
  const doc = { visibilityState: 'visible', hasFocus: () => true, addEventListener: (t, h) => { docL[t] = h }, removeEventListener: t => { delete docL[t] }, ...over }
  const win = { addEventListener: (t, h) => { winL[t] = h }, removeEventListener: t => { delete winL[t] } }
  return { doc, win, docL, winL }
}

describe('subscribePauseEvents: четыре сигнала ухода', () => {
  it('hidden, pagehide и freeze — сразу; visible — ничего', () => {
    const e = env(), on = vi.fn()
    subscribePauseEvents(on, e)
    e.docL.visibilitychange(); expect(on).not.toHaveBeenCalled()
    e.doc.visibilityState = 'hidden'; e.docL.visibilitychange(); expect(on).toHaveBeenLastCalledWith('hidden')
    e.winL.pagehide(); expect(on).toHaveBeenLastCalledWith('pagehide')
    e.docL.freeze(); expect(on).toHaveBeenLastCalledWith('freeze')
  })
  it('blur без hidden (блокировка экрана): пауза через BLUR_CONFIRM_MS, если фокус так и не вернулся', () => {
    const e = env({ hasFocus: () => false }), on = vi.fn()
    subscribePauseEvents(on, e)
    e.winL.blur(); vi.advanceTimersByTime(BLUR_CONFIRM_MS - 10); expect(on).not.toHaveBeenCalled()
    vi.advanceTimersByTime(20); expect(on).toHaveBeenCalledWith('blur')
  })
  it('короткий blur (вернулся focus или у вкладки есть фокус) паузу не ставит', () => {
    const e = env({ hasFocus: () => false }), on = vi.fn()
    subscribePauseEvents(on, e)
    e.winL.blur(); vi.advanceTimersByTime(100); e.winL.focus(); vi.advanceTimersByTime(1000); expect(on).not.toHaveBeenCalled()
    const f = env({ hasFocus: () => true }), on2 = vi.fn()
    subscribePauseEvents(on2, f); f.winL.blur(); vi.advanceTimersByTime(1000); expect(on2).not.toHaveBeenCalled()
  })
  it('отписка снимает все слушатели и таймер blur', () => {
    const e = env({ hasFocus: () => false }), on = vi.fn()
    const off = subscribePauseEvents(on, e)
    e.winL.blur(); off(); vi.advanceTimersByTime(1000)
    expect(on).not.toHaveBeenCalled(); expect(e.docL.visibilitychange).toBeUndefined(); expect(e.docL.freeze).toBeUndefined(); expect(e.winL.blur).toBeUndefined(); expect(e.winL.pagehide).toBeUndefined(); expect(e.winL.focus).toBeUndefined()
  })
})

describe('useWordLanePause: один раз за уход и пометка звука', () => {
  function setup(pauseResult = true) {
    const e = env()
    vi.stubGlobal('document', e.doc); vi.stubGlobal('window', e.win)
    const f = { paused: false, pausedIntro: false, pause: vi.fn(() => pauseResult), restartStage: vi.fn(), dbg: { event: vi.fn() } }
    const start = vi.fn(() => Promise.resolve({ mic: 'granted' }))
    const hook = useWordLanePause({ f, cfg: {}, audioSrc: null, lines: null, startAudio: start })
    return { e, f, start, hook }
  }
  it('hidden + pagehide + blur + freeze подряд — f.pause ровно один раз; повторные сигналы пишутся в журнал', () => {
    const { e, f } = setup()
    e.doc.visibilityState = 'hidden'; e.docL.visibilitychange(); e.winL.pagehide(); e.docL.freeze()
    expect(f.pause).toHaveBeenCalledTimes(1); expect(f.pause).toHaveBeenCalledWith('hidden')
    expect(logs.filter(l => l.includes('уже стоит'))).toHaveLength(2)
  })
  it('пауза помечает звук подозрительным («Продолжить» пойдёт полным путём с новым AudioContext); причина в журнале', () => {
    const { e } = setup()
    expect(needsRewake()).toBeNull()
    e.winL.pagehide()
    expect(needsRewake()).toBe('пауза: pagehide')
    expect(logs.some(l => l.includes('[pause] приложение ушло: pagehide'))).toBe(true)
  })
  it('«Продолжить» открывает новый «уход»: свернули снова — пауза ставится заново; в журнале ctx и пометка звука', () => {
    const { e, f, hook } = setup()
    e.winL.pagehide(); expect(f.pause).toHaveBeenCalledTimes(1)
    f.paused = true; hook.resume()
    expect(logs.some(l => l.includes('«Продолжить»') && l.includes('пометка звука: пауза: pagehide'))).toBe(true)
    e.docL.freeze(); expect(f.pause).toHaveBeenCalledTimes(2)
  })
  it('финал / игра закончена (pause вернула false): следующий уход не считается «уже стоящей» паузой', () => {
    const { e, f } = setup(false)
    e.winL.pagehide(); e.docL.freeze()
    expect(f.pause).toHaveBeenCalledTimes(2)
  })
  it('источник: «Продолжить» зовёт тот же startGameAudio (recreateGameCtx при пометке, reviveWarm, rewake, openGameMic) — других путей нет', () => {
    const pause = readFileSync(new URL('./useWordLanePause.js', import.meta.url), 'utf8')
    expect(pause).toContain("import { startGameAudio } from './wordLaneStart.js'")
    const start = readFileSync(new URL('./wordLaneStart.js', import.meta.url), 'utf8')
    expect(start).toContain('const suspect = consume()'); expect(start).toContain('if (suspect) recreateCtx('); expect(start).toContain('reviveWarm(warmItems(plan))'); expect(start).toContain('warm.onRewarm(() => rewake({ audioSrc }))')
  })
})

describe('после пересоздания AudioContext ничего контекст-зависимого не кэшируется (пункт 8г)', () => {
  const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
  it('ноты, плашка, взлёт и «тык» кэшируют только AudioBuffer (по частоте), GainNode создаётся на каждый звук в gameBufferPlay', () => {
    for (const f of ['./wordLaneNotes.js', './wordLanePlateSound.js', '../../../pitrace/raceTakeoffSound.js', '../../../pitrace/raceChargeTap.js']) expect(read(f)).not.toMatch(/createGain|let\s+\w*[Cc]tx\b/)
    expect(read('../../../pitrace/raceTakeoffSound.js')).toContain('const cache = new Map() // частота дискретизации → AudioBuffer')
    expect(read('../../../pitrace/raceChargeTap.js')).toContain('const cache = new Map() // частота дискретизации → AudioBuffer')
    expect(read('../../../../shared/lib/gameBufferPlay.js')).toMatch(/function build\(c, buffer, rate, gain\)[\s\S]*c\.createGain\(\)/)
  })
})

describe('«Продолжить» — жёсткий перезапуск (gameAudioRestart.js) и сигналы потери звука (v3.3.121)', () => {
  const tick = () => new Promise(r => setTimeout(r, 0))
  function setup({ restart, voice = true } = {}) {
    const e = env()
    vi.stubGlobal('document', e.doc); vi.stubGlobal('window', e.win)
    const f = { paused: true, pausedIntro: false, pause: vi.fn(() => true), restartStage: vi.fn(), dbg: { event: vi.fn() } }
    const start = vi.fn(() => Promise.resolve({ mic: 'granted' }))
    const hook = useWordLanePause({ f, cfg: { w: 1 }, audioSrc: 'a', lines: null, startAudio: start, restart, isVoice: () => voice })
    return { e, f, start, hook }
  }
  it('голос: координатор зовётся синхронно в тапе с voice: true и стартом через startGameAudio(args, deps); звук жив — ступень сначала', async () => {
    vi.useRealTimers()
    const restart = vi.fn(({ start }) => { start({ openMic: 'x' }); return Promise.resolve({ ok: true, mic: 'granted' }) })
    const { f, start, hook } = setup({ restart })
    hook.resume()
    expect(restart).toHaveBeenCalledWith(expect.objectContaining({ voice: true }))
    expect(start).toHaveBeenCalledWith({ cfg: { w: 1 }, audioSrc: 'a', lines: null }, { openMic: 'x' })
    await tick(); expect(f.restartStage).toHaveBeenCalledTimes(1)
  })
  it('тап: координатор получает voice: false (микрофон не трогает)', () => {
    const restart = vi.fn(() => Promise.resolve({ ok: true, mic: 'granted' }))
    setup({ restart, voice: false }).hook.resume()
    expect(restart).toHaveBeenCalledWith(expect.objectContaining({ voice: false }))
  })
  it('звук не вернулся (ok: false) — ступень НЕ перезапускается, пауза остаётся (sound-dead), причина в журнале', async () => {
    vi.useRealTimers()
    const restart = vi.fn(() => Promise.resolve({ ok: false, mic: 'granted', failed: 'контекст interrupted' }))
    const { f, hook } = setup({ restart })
    hook.resume(); await tick()
    expect(f.restartStage).not.toHaveBeenCalled(); expect(f.pause).toHaveBeenCalledWith('sound-dead')
    expect(logs.some(l => l.includes('звук не вернулся (контекст interrupted)'))).toBe(true)
  })
  it('игровой контекст ушёл в interrupted без ухода страницы и не вернулся — пауза (ctx-interrupted)', async () => {
    const { makeFakeWebAudio } = await import('../../../../shared/lib/fakeWebAudio.js')
    const { getGameCtx, closeGameCtx } = await import('../../../../shared/lib/gameAudioCtx.js')
    const { CONFIRM_MS } = await import('../../../../shared/lib/gameAudioSignals.js')
    const fake = makeFakeWebAudio({ state: 'running' }); fake.resumeMode = 'hang'
    vi.stubGlobal('AudioContext', fake.Ctx); vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} })
    const { f } = setup({ restart: vi.fn() })
    f.paused = false
    getGameCtx().setState('interrupted')
    vi.advanceTimersByTime(CONFIRM_MS + 10)
    expect(f.pause).toHaveBeenCalledWith('ctx-interrupted')
    closeGameCtx()
  })
})
