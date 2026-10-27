import { describe, it, expect } from 'vitest'
import { flowReduce, initFlow, answersOf, holdMs, OK_MS, MISS_MS, WORD_MS, ROUND_MS } from './sayAloudFlow.js'

const words = [{ word: 'cat', translation: 'кот' }, { word: 'dog', translation: 'собака' }, { word: 'sun', translation: 'солнце' }]
const run = (s, ...actions) => actions.reduce(flowReduce, s)

describe('ход раунда', () => {
  it('старт: первое слово ждёт ответа', () => {
    expect(initFlow(3)).toMatchObject({ idx: 0, mode: 'ask', answers: [] })
    expect(initFlow(0).mode).toBe('done')
  })

  it('верное слово → ok → следующее', () => {
    const s = run(initFlow(3), { type: 'hear', seq: [0] })
    expect(s).toMatchObject({ mode: 'ok', answers: [true] })
    expect(run(s, { type: 'advance' })).toMatchObject({ idx: 1, mode: 'ask' })
  })

  it('чужое слово из раунда текущее не засчитывает', () => {
    expect(run(initFlow(3), { type: 'hear', seq: [2] })).toMatchObject({ mode: 'ask', answers: [] })
  })

  it('слово, сказанное во время паузы после предыдущего, засчитывается, когда до него дошли', () => {
    let s = run(initFlow(3), { type: 'hear', seq: [0] })               // cat принято, идёт пауза
    s = run(s, { type: 'hear', seq: [0, 1] })                          // dog успели сказать раньше, чем он показан
    expect(s).toMatchObject({ idx: 0, mode: 'ok' })
    expect(run(s, { type: 'advance' })).toMatchObject({ idx: 1, mode: 'ok', answers: [true, true] })
  })

  it('повтор уже принятого слова не засчитывается за следующее', () => {
    const s = run(initFlow(3), { type: 'hear', seq: [0] }, { type: 'advance' }, { type: 'hear', seq: [0, 0] })
    expect(s).toMatchObject({ idx: 1, mode: 'ask', answers: [true] })
  })

  it('не успел → miss с показом ответа; «Пропустить» — то же', () => {
    expect(run(initFlow(3), { type: 'timeout' })).toMatchObject({ mode: 'miss', answers: [false] })
    expect(run(initFlow(3), { type: 'skip' })).toMatchObject({ mode: 'miss', answers: [false] })
    // таймер, опоздавший после верного ответа, ничего не ломает
    expect(run(initFlow(3), { type: 'hear', seq: [0] }, { type: 'timeout' })).toMatchObject({ mode: 'ok', answers: [true] })
  })

  it('после последнего слова — done; advance в режиме ask ничего не делает', () => {
    expect(run(initFlow(1), { type: 'advance' }).mode).toBe('ask')
    expect(run(initFlow(1), { type: 'timeout' }, { type: 'advance' })).toMatchObject({ mode: 'done', idx: 1 })
  })

  it('потолок раунда: finish останавливает, ответы остаются только на заданные слова', () => {
    const s = run(initFlow(3), { type: 'hear', seq: [0] }, { type: 'advance' }, { type: 'finish' })
    expect(s.mode).toBe('done')
    expect(answersOf(words, s)).toEqual([{ word: 'cat', translation: 'кот', ok: true }])
  })

  it('полный раунд: ответы по порядку слов', () => {
    const s = run(initFlow(3), { type: 'hear', seq: [0] }, { type: 'advance' }, { type: 'timeout' }, { type: 'advance' }, { type: 'hear', seq: [0, 2] }, { type: 'advance' })
    expect(s.mode).toBe('done')
    expect(answersOf(words, s).map(a => [a.word, a.ok])).toEqual([['cat', true], ['dog', false], ['sun', true]])
  })

  it('паузы и потолки укладываются в 60–90 с на 8 слов', () => {
    expect(holdMs('ok')).toBe(OK_MS)
    expect(holdMs('miss')).toBe(MISS_MS)
    expect(holdMs('ask')).toBe(0)
    expect(ROUND_MS).toBeLessThanOrEqual(90000)
    expect(WORD_MS).toBeGreaterThan(OK_MS)
  })
})
