import { describe, it, expect } from 'vitest'
import { createOrderGame, expectedLanes, stepOrder, tapLane, orderY, HINT_AFTER, ORDER_MAX_TRIES, ORDER_START_MS, ORDER_GAP_MS, ORDER_SAY_DELAY_MS } from './wordLaneOrder.js'
import { buildRecipe, orderLanes } from './wordLaneRecipe.js'
import { FAIL_Y, CLAIM_FROM_Y } from './wordLaneStudent.js'
import { SPEED, ENTER_Y } from './wordLaneTimeline.js'

const chunks = ['a', 'b', 'c']
const prompts = buildRecipe(chunks).rounds[1].prompts      // куски [1], [2], [0], затем вся фраза
const lanes = orderLanes(3)                                 // lane → кусок: [2, 0, 1]
const DT = 16
const game = () => createOrderGame({ prompts, lanes })
/** Дойти до выкатки следующей подсказки; возвращает момент выкатки */
const spawnNext = g => { for (let t = g.nextAt; t < g.nextAt + 5000; t += DT) { if (stepOrder(g, t).some(e => e.type === 'spawn')) return t } throw new Error('не выкатилось') }

describe('раунд «Порядок» на время: пилюли едут, дорожки надо успеть', () => {
  it('подсказка выкатывается после паузы, диктор называет её, когда пилюли уже видны', () => {
    const g = game()
    const events = []
    for (let t = 0; t <= 2500; t += DT) for (const e of stepOrder(g, t)) events.push({ t, ...e })
    const spawn = events.find(e => e.type === 'spawn')
    expect(spawn.t).toBeGreaterThanOrEqual(ORDER_START_MS)
    expect(spawn.prompt.parts).toEqual([1])
    const say = events.find(e => e.type === 'say')
    expect(say.t - spawn.t).toBeGreaterThanOrEqual(ORDER_SAY_DELAY_MS - DT)
    expect(orderY(g, spawn.t)).toBeCloseTo(ENTER_Y, 9)
    expect(orderY(g, spawn.t + 1000)).toBeCloseTo(ENTER_Y + SPEED, 9)                // все пилюли едут со SPEED
  })

  it('ожидаемые дорожки: для куска — его дорожка в перемешанной раскладке; для фразы — по порядку кусков', () => {
    const g = game()
    expect(expectedLanes(g)).toEqual([lanes.indexOf(1)])
    g.i = 3
    expect(expectedLanes(g)).toEqual([lanes.indexOf(0), lanes.indexOf(1), lanes.indexOf(2)])
  })

  it('верные тапы в срок проходят все подсказки до done; ошибки не штрафуют, подсказывают после HINT_AFTER', () => {
    const g = game()
    const log = []
    let t = 0
    while (!g.finished && t < 60000) {
      t = spawnNext(g)
      const tapAt = t + 1500
      stepOrder(g, tapAt)
      const exp = expectedLanes(g)
      if (g.i === 0) {                                                                  // на первой подсказке сначала ошибаемся
        const bad = [0, 1, 2].find(l => l !== exp[0])
        for (let k = 0; k < HINT_AFTER + 1; k++) log.push(...tapLane(g, bad, tapAt))
      }
      for (const lane of exp) log.push(...tapLane(g, lane, tapAt))
      t = tapAt
    }
    expect(g.finished).toBe(true)
    expect(log.filter(e => e.type === 'wrong')).toHaveLength(HINT_AFTER + 1)
    expect(log.filter(e => e.type === 'wrong').at(-1).hint).toBe(true)
    expect(log.filter(e => e.type === 'wrong')[0].hint).toBe(false)
    expect(log.at(-1)).toEqual({ type: 'done', mistakes: HINT_AFTER + 1, lost: 0 })
    expect(log.filter(e => e.type === 'ok')).toHaveLength(1 + 1 + 1 + 3)
  })

  it('на фразе порядок важен: не в том порядке — wrong', () => {
    const g = game(); g.i = 3
    const t = spawnNext(g) + 1500
    stepOrder(g, t)
    const exp = expectedLanes(g)
    expect(tapLane(g, exp[1], t)[0].type).toBe('wrong')
    expect(tapLane(g, exp[0], t)[0].type).toBe('ok')
    expect(tapLane(g, exp[2], t)[0].type).toBe('wrong')
  })

  it('не успел: пилюли ушли вниз — fail, подсказка выкатывается снова; после ORDER_MAX_TRIES попыток идём дальше (lost)', () => {
    const g = game()
    const events = []
    for (let t = 0; t <= 120000 && !g.finished; t += DT) for (const e of stepOrder(g, t)) events.push({ t, ...e })
    const fails = events.filter(e => e.type === 'fail')
    expect(fails).toHaveLength(prompts.length * ORDER_MAX_TRIES)
    expect(fails.filter(f => f.lost)).toHaveLength(prompts.length)
    expect(events.filter(e => e.type === 'spawn').filter(e => e.prompt.id === prompts[0].id)).toHaveLength(ORDER_MAX_TRIES)   // та же подсказка повторяется
    expect(events.at(-1)).toMatchObject({ type: 'done', lost: prompts.length })
    const f0 = fails[0]; const sp = events.find(e => e.type === 'spawn')
    expect(ENTER_Y + (SPEED * (f0.t - sp.t)) / 1000).toBeGreaterThan(FAIL_Y)   // fail — когда пилюли уже ниже FAIL_Y
  })

  it('тапы вне времени (пилюли ещё не видны, уже ушли, паузы между подсказками) игнорируются', () => {
    const g = game()
    expect(tapLane(g, 0, 100)).toEqual([])                                              // до выкатки
    const t = spawnNext(g)
    stepOrder(g, t)
    expect(orderY(g, t + 100)).toBeLessThan(CLAIM_FROM_Y)
    expect(tapLane(g, expectedLanes(g)[0], t + 100)).toEqual([])                        // пилюля ещё над экраном
    expect(tapLane(g, expectedLanes(g)[0], t + 6000)).toEqual([])                       // уже ушла
    const ok = tapLane(g, expectedLanes(g)[0], t + 1500)
    expect(ok[0].type).toBe('ok')
    expect(tapLane(g, 0, t + 1600)).toEqual([])                                         // пауза до следующей подсказки
    expect(ORDER_GAP_MS).toBeGreaterThan(0)
  })

  it('пустой раунд закончен сразу; после конца тапы игнорируются', () => {
    expect(createOrderGame({ prompts: [], lanes: [0] }).finished).toBe(true)
    const g = game(); g.finished = true
    expect(tapLane(g, 0, 1000)).toEqual([])
    expect(stepOrder(g, 1000)).toEqual([])
  })
})
