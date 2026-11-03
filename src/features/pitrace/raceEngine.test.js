import { describe, it, expect, vi, afterEach } from 'vitest'
import { runOrderScene } from '../player/modules/rotate-phone/wordLaneOrderScene.js'
import { createOrderGame, stepOrder, failPrompt, ORDER_GAP_MS, ORDER_START_MS } from '../player/modules/rotate-phone/wordLaneOrder.js'
import { startFlight, FLIGHT_MS } from '../player/modules/rotate-phone/wordLaneMotion.js'
import { createPool } from '../player/modules/rotate-phone/wordLanePool.js'
import { buildRaceStages } from './raceStages.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'

vi.mock('../player/modules/rotate-phone/wordLaneSnap.js', () => ({ snapPill: vi.fn(), missPill: vi.fn() }))
afterEach(() => vi.unstubAllGlobals())

// Точки расширения движка для «Гонки с Питом» (CONCEPT_RACE.md, §4): заход «Слушай и лови» отвечают голосом (scene.speak), подписи внутри пилюль, повтор захода, скорость полёта
const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })
const stage = buildRaceStages({ plan }).stages.find(s => s.act === 'catch' && s.type === 'discern')

function setup(over = {}) {
  let now = 0
  const queue = []
  vi.stubGlobal('requestAnimationFrame', cb => { queue.push(cb); return queue.length })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const pool = { take: vi.fn(lane => lane), linger: vi.fn(), el: () => ({ getBoundingClientRect: () => ({}) }), give: vi.fn(), attr: vi.fn(), cap: vi.fn(), paintFill: vi.fn(), flashLane: vi.fn(), hint: vi.fn() }
  const fx = { say: vi.fn(), sayText: vi.fn(), win: vi.fn(), miss: vi.fn(), fail: vi.fn(), finished: vi.fn() }
  const live = { current: { seq: [], misses: 0 } }
  const scene = { prompts: stage.prompts, lanes: [0, 1, 2], count: 3, speak: true, maxTries: stage.maxTries, ...over }
  const run = runOrderScene({ pool, scene, fxRef: { current: fx }, liveRef: live })
  const tickTo = t => { now = t; queue.splice(0).forEach(cb => cb(t)) }
  const advance = (from, to) => { for (let t = from; t <= to; t += 50) tickTo(t); return to }
  const prompt = { ...stage.prompts[0], sayAt: ORDER_START_MS + stage.prompts[0].sayAt } // слово Пита — от выкатки подсказки, а она — через ORDER_START_MS от старта раунда
  return { run, pool, fx, live, advance, tickTo, prompt }
}

describe('движок: «Слушай и лови» отвечают голосом', () => {
  it('пилюли берут подписи prompt.caps (перевод); слово Пита звучит один раз (sayAt)', () => {
    const { run, pool, fx, advance, prompt } = setup()
    advance(0, prompt.sayAt - 100)
    expect(fx.say).not.toHaveBeenCalled()
    expect(pool.take.mock.calls.map(c => c[1].cap)).toEqual(prompt.caps.filter(Boolean).length === 3 ? [prompt.caps[0], prompt.caps[1], prompt.caps[2]] : [])
    advance(prompt.sayAt - 50, prompt.sayAt + 200)
    expect(fx.say).toHaveBeenCalledTimes(1)
    run.stop()
  })
  it('верное слово, услышанное после слова Пита, засчитывается тапом верной дорожки; до слова Пита голос не считается', () => {
    const { run, pool, fx, live, advance, prompt } = setup()
    let t = advance(0, 800)
    live.current = { seq: [0], misses: 0 } // голос до слова Пита (эхо, шум): не засчитывается
    t = advance(t + 50, prompt.sayAt - 100)
    expect(fx.win).not.toHaveBeenCalled(); expect(fx.fail).not.toHaveBeenCalled()
    t = advance(t + 50, prompt.sayAt + 300)
    live.current = { seq: [0, 0], misses: 0 } // слово сказано, пока Пит уже назвал своё
    advance(t + 50, t + 200)
    expect(fx.win).toHaveBeenCalledTimes(1); expect(pool.paintFill).toHaveBeenCalled(); expect(pool.flashLane).toHaveBeenCalledWith(prompt.answer[0])
    run.stop()
  })
  it('чужое слово (промах слушателя) — провал захода: fail, заход повторяется один раз с тем же словом, на пилюлях проявляются слова', () => {
    const { run, pool, fx, live, advance, prompt } = setup()
    let t = advance(0, prompt.sayAt + 300)
    live.current = { seq: [], misses: 1 }
    t = advance(t + 50, t + 150)
    expect(fx.fail).toHaveBeenCalledWith({ order: true, lost: false }) // первый провал: заход ещё повторится
    expect(pool.cap).toHaveBeenCalledWith(expect.anything(), expect.any(String)); expect(pool.linger).toHaveBeenCalled(); expect(fx.win).not.toHaveBeenCalled() // слова проявились, упущенные пилюли всплыли читаться
    t = advance(t + 50, t + ORDER_GAP_MS + 200)
    expect(pool.take.mock.calls.length).toBeGreaterThan(3) // те же три пилюли выкатились заново
    t = advance(t + 50, t + prompt.sayAt + 400)
    expect(fx.say).toHaveBeenCalledTimes(2) // слово Пита звучит снова
    live.current = { seq: [], misses: 2 }
    advance(t + 50, t + 150)
    expect(fx.fail).toHaveBeenLastCalledWith({ order: true, lost: true }); expect(fx.finished).toHaveBeenCalledTimes(1) // повтор был один — дальше раунд закончен
    run.stop()
  })
  it('чужое слово из словаря слушателя (цель с номером больше 0 — двойник или другое слово раунда) — тоже провал, а не ответ', () => {
    const { run, fx, live, advance, prompt } = setup()
    advance(0, prompt.sayAt + 300)
    live.current = { seq: [2], misses: 0 }
    advance(prompt.sayAt + 350, prompt.sayAt + 450)
    expect(fx.fail).toHaveBeenCalledTimes(1); expect(fx.win).not.toHaveBeenCalled()
    run.stop()
  })
  it('тап вместо речи: не та дорожка — тоже провал захода, верная — засчитана', () => {
    const { run, fx, advance, prompt } = setup()
    advance(0, prompt.sayAt + 300)
    run.api.tap((prompt.answer[0] + 1) % 3)
    expect(fx.fail).toHaveBeenCalledTimes(1); expect(fx.miss).not.toHaveBeenCalled()
    run.stop()
    const b = setup()
    b.advance(0, b.prompt.sayAt + 300)
    b.run.api.tap(b.prompt.answer[0])
    expect(b.fx.win).toHaveBeenCalledTimes(1)
    b.run.stop()
  })
  it('без scene.speak голос ничего не решает (обычный «Различи» отвечают тапом)', () => {
    const { run, fx, live, advance, prompt } = setup({ speak: false })
    advance(0, prompt.sayAt + 300)
    live.current = { seq: [0], misses: 1 }
    advance(prompt.sayAt + 350, prompt.sayAt + 600)
    expect(fx.win).not.toHaveBeenCalled(); expect(fx.fail).not.toHaveBeenCalled()
    run.stop()
  })
})

describe('движок: failPrompt, скорость полёта, подпись пилюли', () => {
  it('failPrompt: попытки кончились — подсказка потеряна и раунд закончен; stepOrder даёт тот же результат по времени', () => {
    const g = createOrderGame({ prompts: [{ parts: [0], answer: [0], slots: [0], texts: ['a'] }], lanes: [0, 1, 2], maxTries: 2 })
    stepOrder(g, 600)
    expect(failPrompt(g, 700).map(e => e.type)).toEqual(['fail']); expect(g.tries).toBe(1); expect(g.state).toBe('gap')
    const last = failPrompt(g, 800)
    expect(last.map(e => e.type)).toEqual(['fail', 'done']); expect(last[0].lost).toBe(true); expect(g.finished).toBe(true)
  })
  it('startFlight: скорость — playbackRate, положение по часам = время × скорость; без скорости всё как было', () => {
    const anim = {}
    const el = { animate: vi.fn(() => anim) }
    startFlight(el, 1000); expect(anim.currentTime).toBe(1000); expect(anim.playbackRate).toBeUndefined()
    startFlight(el, 1000, 1.1); expect(anim.playbackRate).toBe(1.1); expect(anim.currentTime).toBeCloseTo(1100, 5)
    expect(FLIGHT_MS).toBeGreaterThan(0)
  })
  it('пул: take(lane, { cap, speed }) пишет data-cap и запускает полёт на скорости; clean снимает подпись; pool.cap меняет её', () => {
    const attrs = new Map()
    const part = () => ({ style: { setProperty() {} }, offsetHeight: 100, setAttribute() {}, removeAttribute() {}, querySelector: () => null })
    const mk = () => ({ dataset: {}, style: { setProperty() {} }, setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k), getAttribute: k => attrs.get(k) ?? null, animate: () => ({ cancel() {} }), querySelector: () => part(), querySelectorAll: () => [], classList: { contains: () => true } })
    const el = mk()
    const root = { querySelectorAll: sel => (sel === '[data-pill]' ? [el] : []), classList: { contains: () => true }, querySelector: () => null }
    const pool = createPool(root)
    const k = pool.take(1, { cap: 'пытаюсь', speed: 1.05 })
    expect(attrs.get('data-cap')).toBe('пытаюсь')
    pool.cap(k, 'trying'); expect(attrs.get('data-cap')).toBe('trying')
    pool.cap(k, ''); expect(attrs.has('data-cap')).toBe(false)
    pool.give(k); pool.take(1, {}); expect(attrs.has('data-cap')).toBe(false) // без подписи пилюля чистая
    const k2 = pool.take(1, {})
    expect(() => pool.linger(k2, { to: 60, ms: 1000 })).not.toThrow() // упущенная пилюля всплывает и гаснет (WAAPI-заглушка из мока)
  })
})
