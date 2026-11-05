import { describe, it, expect, vi, afterEach } from 'vitest'
import { runOrderScene } from './wordLaneOrderScene.js'
import { ORDER_START_MS } from './wordLaneOrder.js'

vi.mock('./wordLaneSnap.js', () => ({ snapPill: vi.fn(), missPill: vi.fn() })) // щелчок пилюли рисует DOM — здесь не нужен

// Сцена «Различи» репетиции (prompt.written): слово на пилюле НЕ пишется (v3.3.101), пилюли молчат, слово звучит один раз, до этого тап не засчитывается; пул и часы подставлены
afterEach(() => vi.unstubAllGlobals())

function setup(prompt) {
  let now = 0
  const queue = []
  vi.stubGlobal('requestAnimationFrame', cb => { queue.push(cb); return queue.length })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const clips = [0, 1, 2].map(() => { const a = {}; return { attrs: a, setAttribute: (k, v) => { a[k] = v }, removeAttribute: k => { delete a[k] } } })
  const pool = { take: lane => lane, el: k => ({ querySelector: () => clips[k], getBoundingClientRect: () => ({}) }), give: vi.fn(), attr: vi.fn(), paintFill: vi.fn(), flashLane: vi.fn(), hint: vi.fn() }
  const fx = { say: vi.fn(), sayText: vi.fn(), win: vi.fn(), miss: vi.fn(), fail: vi.fn(), finished: vi.fn() }
  const run = runOrderScene({ pool, scene: { prompts: [prompt], lanes: [0, 1, 2], count: 3 }, fxRef: { current: fx } })
  const tickTo = t => { now = t; const cbs = queue.splice(0); cbs.forEach(cb => cb(t)) }
  return { run, pool, fx, clips, tickTo }
}
const prompt = (o = {}) => ({ id: 'd', parts: [0], answer: [1], slots: [0, 1, 2], texts: ['earn', 'learn', 'lean'], stagger: 500, lead: 400, ...o })

describe('«Различи» с написанными словами', () => {
  it('на пилюлях текста нет, пилюли не озвучиваются; слово произносится один раз (sayAt)', () => {
    const { run, fx, clips, tickTo } = setup(prompt({ written: true, sayAt: 3000 }))
    for (let t = 0; t <= 2900; t += 50) tickTo(t)
    expect(clips.every(c => !('data-word' in c.attrs))).toBe(true) // текста на пилюлях нет
    expect(fx.sayText).not.toHaveBeenCalled(); expect(fx.say).not.toHaveBeenCalled()      // слово ещё не звучало
    expect(ORDER_START_MS).toBeLessThan(1000)
    for (let t = 2950; t <= 3600; t += 50) tickTo(t)
    expect(fx.say).toHaveBeenCalledTimes(1)
    run.stop()
  })
  it('без written (обычная игра «Различи») слов на пилюлях нет, каждая пилюля озвучивает своё слово', () => {
    const { run, fx, clips, tickTo } = setup(prompt({ sayAt: 0 }))
    for (let t = 0; t <= 4500; t += 50) tickTo(t)
    expect(clips.every(c => !('data-word' in c.attrs))).toBe(true)
    expect(fx.sayText.mock.calls.map(c => c[0])).toEqual(['earn', 'learn', 'lean'])
    run.stop()
  })
  it('верный тап после слова: пилюля принята; пилюли «Различи» остаются без текста', () => {
    const { run, pool, clips, tickTo } = setup(prompt({ written: true, sayAt: 3000 }))
    for (let t = 0; t <= 3300; t += 50) tickTo(t)
    run.api.tap(1); expect(pool.paintFill).not.toHaveBeenCalled() // слово ещё не прозвучало (sayAt отсчитывается от выкатки подсказки)
    for (let t = 3350; t <= 3700; t += 50) tickTo(t)
    run.api.tap(0) // неверная дорожка
    run.api.tap(1)
    expect(pool.paintFill).toHaveBeenCalled()
    for (let t = 3750; t <= 4000; t += 50) tickTo(t)
    expect(clips.every(c => !('data-word' in c.attrs))).toBe(true)
    expect(pool.give).toHaveBeenCalled() // «next»: лишние пилюли убраны
    run.stop()
  })
})
