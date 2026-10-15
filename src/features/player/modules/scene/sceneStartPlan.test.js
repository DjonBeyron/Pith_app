import { describe, it, expect, vi } from 'vitest'
import {
  startDecision, waitRowAppear, runningAnimations, scheduleSceneStart, autoStartSound, pageHasBeenActive, APPEAR_FALLBACK_MS,
} from './sceneStartPlan.js'
import { MSG_SLIDE_MS } from '../../PlayerFeed.jsx'

// Ручные таймеры: setTimeout складывает колбэки, run(ms) двигает время
function fakeTimers() {
  let now = 0, id = 0
  const q = new Map()
  return {
    setTimeout: (fn, ms) => { q.set(++id, { at: now + ms, fn }); return id },
    clearTimeout: i => q.delete(i),
    run(ms) {
      now += ms
      ;[...q.entries()].sort((a, b) => a[1].at - b[1].at).forEach(([k, t]) => { if (t.at <= now) { q.delete(k); t.fn() } })
    },
    pending: () => q.size,
  }
}
const flush = () => new Promise(r => setTimeout(r, 0))
const anim = (resolveRef, playState = 'running') => ({ playState, finished: new Promise(r => { resolveRef.push(r) }) })
const rowWith = anims => {
  const row = { getAnimations: () => anims }
  return { closest: sel => (sel === '.playerMsgRow' ? row : null) }
}

describe('startDecision — стартовать ли сцену самой', () => {
  it('auto и показана → arm; pending → wait; manual / история / нет сцены → skip', () => {
    expect(startDecision({ start: 'auto', isHistory: false, pending: false })).toBe('arm')
    expect(startDecision({ start: 'auto', isHistory: false, pending: true })).toBe('wait')
    expect(startDecision({ start: 'manual', isHistory: false, pending: false })).toBe('skip')
    expect(startDecision({ start: 'auto', isHistory: true, pending: false })).toBe('skip')
    expect(startDecision({ start: 'auto', isHistory: false, pending: false, hasScene: false })).toBe('skip')
  })
})

describe('waitRowAppear — конец анимации появления сообщения', () => {
  it('константа ожидания = длительность въезда ленты (MSG_SLIDE_MS), не догадка', () => {
    expect(APPEAR_FALLBACK_MS).toBe(MSG_SLIDE_MS)
    expect(APPEAR_FALLBACK_MS).toBeGreaterThan(0)
  })

  it('идёт WAAPI-анимация строки → ждём её finished, таймер не ставится', async () => {
    const resolvers = []
    const t = fakeTimers()
    const el = rowWith([anim(resolvers), anim(resolvers, 'finished')])
    expect(runningAnimations(el)).toHaveLength(1)
    const w = waitRowAppear(el, { reducedMotion: false, timers: t, raf: cb => cb() })
    let how = null
    w.promise.then(h => { how = h })
    await flush()
    expect(how).toBeNull()
    resolvers[0]()
    await flush()
    expect(how).toBe('animation')
    expect(t.pending()).toBe(0)
  })

  it('анимации нет и через кадр не появилась → таймер MSG_SLIDE_MS', async () => {
    const t = fakeTimers()
    const w = waitRowAppear(rowWith([]), { reducedMotion: false, timers: t, raf: cb => cb() })
    let how = null
    w.promise.then(h => { how = h })
    await flush()
    expect(how).toBeNull()
    t.run(APPEAR_FALLBACK_MS - 1)
    await flush()
    expect(how).toBeNull()
    t.run(1)
    await flush()
    expect(how).toBe('timer')
  })

  it('анимация завелась только через кадр (эффект раньше ленты) → всё равно ждём её', async () => {
    const resolvers = []
    const anims = []
    const t = fakeTimers()
    const w = waitRowAppear(rowWith(anims), { reducedMotion: false, timers: t, raf: cb => { anims.push(anim(resolvers)); cb() } })
    let how = null
    w.promise.then(h => { how = h })
    await flush()
    expect(how).toBeNull()
    expect(t.pending()).toBe(0)
    resolvers[0]()
    await flush()
    expect(how).toBe('animation')
  })

  it('prefers-reduced-motion → сразу (анимации нет); cancel() не даёт resolve', async () => {
    const w = waitRowAppear(rowWith([]), { reducedMotion: true })
    await expect(w.promise).resolves.toBe('reduced-motion')
    const t = fakeTimers()
    const w2 = waitRowAppear(rowWith([]), { reducedMotion: false, timers: t, raf: cb => cb() })
    let done = false
    w2.promise.then(() => { done = true })
    w2.cancel()
    t.run(APPEAR_FALLBACK_MS * 2)
    await flush()
    expect(done).toBe(false)
  })

  it('без DOM-элемента (нет ленты) не падает — таймер', async () => {
    const t = fakeTimers()
    const w = waitRowAppear(null, { reducedMotion: false, timers: t, raf: cb => cb() })
    t.run(APPEAR_FALLBACK_MS)
    await expect(w.promise).resolves.toBe('timer')
  })
})

describe('scheduleSceneStart — появление → задержка → видимость → play один раз', () => {
  const appear = () => { let res; const promise = new Promise(r => { res = r }); return { promise, cancel: vi.fn(), resolve: res } }

  it('play только после конца появления И задержки, не раньше', async () => {
    const t = fakeTimers()
    const play = vi.fn()
    const w = appear()
    scheduleSceneStart({ waitAppear: w, delayMs: 500, play, timers: t, isHidden: () => false })
    t.run(5000)
    expect(play).not.toHaveBeenCalled()
    w.resolve('animation')
    await flush()
    expect(play).not.toHaveBeenCalled()
    t.run(499)
    expect(play).not.toHaveBeenCalled()
    t.run(1)
    expect(play).toHaveBeenCalledTimes(1)
    t.run(10000)
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('задержка 0 → play сразу после появления; cancel до появления/в задержке — без play', async () => {
    const t = fakeTimers()
    const play = vi.fn()
    const w = appear()
    scheduleSceneStart({ waitAppear: w, delayMs: 0, play, timers: t, isHidden: () => false })
    w.resolve('timer')
    await flush()
    t.run(0)
    expect(play).toHaveBeenCalledTimes(1)

    const p2 = vi.fn(), w2 = appear()
    const cancel = scheduleSceneStart({ waitAppear: w2, delayMs: 300, play: p2, timers: t, isHidden: () => false })
    w2.resolve('animation')
    await flush()
    cancel()
    t.run(1000)
    expect(p2).not.toHaveBeenCalled()
    expect(w2.cancel).toHaveBeenCalled()
  })

  it('скрытая вкладка → старт откладывается до visibilitychange, потом ровно один play', async () => {
    const t = fakeTimers()
    const play = vi.fn()
    let hidden = true
    let visibleCb = null
    const unsub = vi.fn()
    const w = appear()
    scheduleSceneStart({
      waitAppear: w, delayMs: 100, play, timers: t,
      isHidden: () => hidden, onVisible: cb => { visibleCb = cb; return unsub },
    })
    w.resolve('animation')
    await flush()
    t.run(100)
    expect(play).not.toHaveBeenCalled()
    expect(visibleCb).toBeTypeOf('function')
    hidden = false
    visibleCb()
    expect(play).toHaveBeenCalledTimes(1)
    expect(unsub).toHaveBeenCalled()
    visibleCb()
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('cancel во время ожидания видимости снимает подписку', async () => {
    const t = fakeTimers()
    const unsub = vi.fn()
    const w = appear()
    const cancel = scheduleSceneStart({ waitAppear: w, delayMs: 0, play: vi.fn(), timers: t, isHidden: () => true, onVisible: () => unsub })
    w.resolve('animation')
    await flush()
    t.run(0)
    cancel()
    expect(unsub).toHaveBeenCalled()
  })
})

describe('политика звука автозапуска', () => {
  it('жест на странице был → со звуком; не было → без; «без звука» урока → без; API нет → пробуем со звуком', () => {
    expect(autoStartSound({ hasBeenActive: true })).toBe(true)
    expect(autoStartSound({ hasBeenActive: false })).toBe(false)
    expect(autoStartSound({ muted: true, hasBeenActive: true })).toBe(false)
    expect(autoStartSound({ hasBeenActive: null })).toBe(true)
    expect(pageHasBeenActive({ userActivation: { hasBeenActive: true } })).toBe(true)
    expect(pageHasBeenActive({ userActivation: { hasBeenActive: false } })).toBe(false)
    expect(pageHasBeenActive({})).toBeNull()
    expect(pageHasBeenActive(null)).toBeNull()
  })
})
