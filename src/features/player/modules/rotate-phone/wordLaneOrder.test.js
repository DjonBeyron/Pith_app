import { describe, it, expect } from 'vitest'
import { createOrderGame, expectedLanes, tapLane, HINT_AFTER } from './wordLaneOrder.js'
import { buildRecipe, orderLanes } from './wordLaneRecipe.js'

const chunks = ['a', 'b', 'c']
const recipe = buildRecipe(chunks)
const prompts = recipe.rounds[1].prompts           // куски [1], [2], [0], затем вся фраза
const lanes = orderLanes(3)                        // lane → кусок: [2, 0, 1]
const game = () => createOrderGame({ prompts, lanes })

describe('раунд «Порядок»', () => {
  it('ожидаемые дорожки: для куска — его дорожка в перемешанной раскладке, для фразы — дорожки кусков по порядку', () => {
    const g = game()
    expect(expectedLanes(g)).toEqual([lanes.indexOf(1)])
    g.i = 3
    expect(expectedLanes(g)).toEqual([lanes.indexOf(0), lanes.indexOf(1), lanes.indexOf(2)])
  })
  it('верный тап — ok; подсказка пройдена — next; последняя — done', () => {
    const g = game()
    const log = []
    for (let i = 0; i < prompts.length; i++) for (const lane of expectedLanes(g)) log.push(...tapLane(g, lane))
    expect(log.filter(e => e.type === 'ok')).toHaveLength(1 + 1 + 1 + 3)
    expect(log.filter(e => e.type === 'next')).toHaveLength(4)
    expect(log.at(-1)).toEqual({ type: 'done', mistakes: 0 })
    expect(g.finished).toBe(true)
    expect(prompts).toHaveLength(4)
  })
  it('ошибка не штрафуется и не двигает: wrong, подсказка подсвечивается с HINT_AFTER-й ошибки; потом верный тап проходит', () => {
    const g = game()
    const right = expectedLanes(g)[0]
    const bad = [0, 1, 2].find(l => l !== right)
    const first = tapLane(g, bad)
    expect(first).toEqual([{ type: 'wrong', lane: bad, expected: right, hint: false }])
    for (let i = 1; i < HINT_AFTER; i++) tapLane(g, bad)
    expect(tapLane(g, bad)[0].hint).toBe(true)
    expect(tapLane(g, right).map(e => e.type)).toEqual(['ok', 'next'])
    expect(g.wrong).toBe(0)
    expect(g.mistakes).toBe(HINT_AFTER + 1)
  })
  it('на фразе порядок важен: не в том порядке — wrong', () => {
    const g = game(); g.i = 3
    const exp = expectedLanes(g)
    expect(tapLane(g, exp[1])[0].type).toBe('wrong')
    expect(tapLane(g, exp[0])[0].type).toBe('ok')
    expect(tapLane(g, exp[2])[0].type).toBe('wrong')
  })
  it('пустой раунд закончен сразу; после конца тапы игнорируются', () => {
    expect(createOrderGame({ prompts: [], lanes: [0] }).finished).toBe(true)
    const g = game(); g.finished = true
    expect(tapLane(g, 0)).toEqual([])
  })
})
