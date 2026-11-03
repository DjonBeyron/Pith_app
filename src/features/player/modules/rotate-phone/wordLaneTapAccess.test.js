import { describe, it, expect } from 'vitest'
import { createOrderGame, stepOrder, tapLane, expectedLanes } from './wordLaneOrder.js'
import { buildRecipe, orderLanes } from './wordLaneRecipe.js'
import { ENTER_Y, SPEED, OPEN_Y, LISTEN_Y_MIN, LISTEN_Y_MAX, isListening } from './wordLaneTimeline.js'
import { FAIL_Y } from './wordLaneStudent.js'

// Доступность пилюль в раундах «Порядок» и «Различи» (v3.3.101, замечание владельца): тап по пилюле, которая ещё не вышла из-за верхнего края на 90 % или ушла за нижний на 50 %, не засчитывается — ни верный, ни ошибочный
const DT = 16
const tOfY = (g, y) => g.spawnAt + ((y - ENTER_Y) / SPEED) * 1000
const spawn = g => { for (let t = g.nextAt; t < g.nextAt + 5000; t += DT) if (stepOrder(g, t).some(e => e.type === 'spawn')) return t; throw new Error('не выкатилось') }

describe('«Порядок»: тап по недоступной пилюле не засчитывается', () => {
  const chunks = ['a', 'b', 'c']
  const prompts = buildRecipe(chunks).rounds[1].prompts
  const lanes = orderLanes(3)
  const fresh = () => { const g = createOrderGame({ prompts, lanes }); spawn(g); return g }

  it('порог сверху — LISTEN_Y_MIN (видно 90 %): выше — тап не идёт ни верный, ни неверный; на пороге и ниже — верный засчитан', () => {
    const g = fresh()
    const right = expectedLanes(g)[0], wrong = [0, 1, 2].find(l => l !== right)
    for (const y of [-10, 0, 5, LISTEN_Y_MIN - 0.5]) { expect(tapLane(g, right, tOfY(g, y)), `верный y=${y}`).toEqual([]); expect(tapLane(g, wrong, tOfY(g, y)), `неверный y=${y}`).toEqual([]) }
    expect(g.mistakes).toBe(0); expect(g.tapped).toEqual([])
    expect(tapLane(g, right, tOfY(g, LISTEN_Y_MIN + 0.5)).map(e => e.type)).toContain('ok')
  })
  it('внизу: пилюля ушла за нижний край на 50 % и больше — тап не засчитывается, пока она на экране — засчитывается', () => {
    const g = fresh()
    const right = expectedLanes(g)[0]
    expect(isListening(LISTEN_Y_MAX)).toBe(false)
    for (const y of [LISTEN_Y_MAX, 105, 118]) expect(tapLane(g, right, tOfY(g, y)), `y=${y}`).toEqual([])
    expect(tapLane(g, right, tOfY(g, 60)).map(e => e.type)).toContain('ok')
  })
})

describe('«Различи»: тап по недоступной пилюле не засчитывается', () => {
  const prompt = { parts: [], texts: ['learn', 'lean', 'learns'], slots: [0, 1, 2], answer: [1] }
  const fresh = () => { const g = createOrderGame({ prompts: [prompt], lanes: [0, 1, 2] }); spawn(g); g.said = true; return g } // слово уже прозвучало

  it('выше порога (9 %, пилюля показана не на 90 %) — тап не идёт; доступна — верный тап засчитан', () => {
    const g = fresh()
    for (const y of [-5, 2, LISTEN_Y_MIN - 0.5, OPEN_Y - 1]) expect(tapLane(g, 1, tOfY(g, y)), `y=${y}`).toEqual([])
    expect(g.tapped).toEqual([]); expect(g.mistakes).toBe(0)
    expect(tapLane(g, 1, tOfY(g, OPEN_Y + 1)).map(e => e.type)).toContain('ok')
  })
  it('внизу: ушла за нижний край на 50 % и больше — не тапается', () => {
    const g = fresh()
    for (const y of [LISTEN_Y_MAX, 110]) expect(tapLane(g, 1, tOfY(g, y))).toEqual([])
    expect(FAIL_Y).toBeLessThan(LISTEN_Y_MAX) // «не успел» засчитывается раньше, чем пилюля станет недоступной
  })
})
