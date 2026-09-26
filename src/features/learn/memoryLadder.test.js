import { describe, it, expect } from 'vitest'
import { levelOf, levelFill, journey, buildLadder } from './memoryLadder.js'
import { orth, ladderLinks, ballPath, FIN_TOP } from './ladderWires.js'

describe('ступени памяти', () => {
  it('шаг → ступень: 1–2 новенькие, 3–4 мои, 5 родные', () => {
    expect([1, 2, 3, 4, 5].map(levelOf)).toEqual([1, 1, 2, 2, 3])
  })

  it('заливка — путь к следующей ступени, весь путь растёт с шагом', () => {
    expect([1, 2, 3, 4, 5].map(levelFill)).toEqual([0.25, 0.75, 0.25, 0.75, 1])
    const j = [1, 2, 3, 4, 5].map(journey)
    expect(j[4]).toBe(1)
    j.slice(1).forEach((v, i) => expect(v).toBeGreaterThan(j[i]))
  })

  it('слова по ступеням: сегодняшние первыми, дальше по сроку; постоянная — отдельно', () => {
    const memory = [
      { word: 'go', step: 1, due_on: '2026-09-28' },
      { word: 'keep', step: 2, due_on: '2026-09-27' },
      { word: 'cook', step: 1, due_on: '2026-09-26' },
      { word: 'want', step: 4, due_on: '2026-10-02' },
      { word: 'make', step: 5, due_on: '2026-10-20' },
      { word: 'hello', step: 5, due_on: '2026-11-20', settled_on: '2026-09-20' },
    ]
    const ladder = buildLadder(memory, {
      todayWords: new Set(['go']),
      hasDeck: w => w !== 'keep',
      wordHome: new Map([['go', { lessonId: 'l-go', phrase: 'Let’s go' }]]),
    })
    expect(ladder.levels.map(l => l.words.map(w => w.word))).toEqual([['go', 'cook', 'keep'], ['want'], ['make']])
    expect(ladder.total).toBe(5)
    expect(ladder.permanent.map(w => w.word)).toEqual(['hello'])
    const [go, , keep] = ladder.levels[0].words
    expect(go).toMatchObject({ today: true, hasDeck: true, lessonId: 'l-go', phrase: 'Let’s go' })
    expect(keep).toMatchObject({ today: false, hasDeck: false, lessonId: null, phrase: '' })
  })
})

describe('линии памяти', () => {
  it('ломаная со скруглёнными углами', () => {
    expect(orth([[0, 0], [0, 40], [30, 40]], 10)).toBe('M 0 0 L 0 30 Q 0 40 10 40 L 30 40')
    // короткий отрезок — радиус не больше половины отрезка
    expect(orth([[0, 0], [0, 6], [30, 6]], 10)).toBe('M 0 0 L 0 3 Q 0 6 3 6 L 30 6')
  })

  it('ствол от низа шапки — в левый бок каждой ступени, от «Родных» — в верх пятиугольника', () => {
    const hero = { l: 0, t: 0, r: 300, b: 100 }
    const blocks = [
      { l: 0, t: 140, r: 200, b: 200 }, { l: 50, t: 220, r: 250, b: 280 }, { l: 100, t: 300, r: 300, b: 360 },
    ]
    const fin = { l: 0, t: 400, r: 180, b: 559 }
    const links = ladderLinks({ hero, blocks, fin, edge: -22 })
    expect(links).toHaveLength(4)
    expect(links[1].pts).toEqual([[150, 100], [150, 114], [-11, 114], [-11, 250], [50, 250]])
    expect(links[3].pts.at(-1)).toEqual([90, 400 + 159 * FIN_TOP])
    expect(links[3].pts[0]).toEqual([200, 360])
    // шарик бежит обратно: из ступени к шапке
    expect(ballPath(links[0]).startsWith('M 0 170')).toBe(true)
    expect(ballPath(links[0]).endsWith('L 150 100')).toBe(true)
  })
})
