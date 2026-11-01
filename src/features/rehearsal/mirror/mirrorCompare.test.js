import { describe, it, expect } from 'vitest'
import { compareLayout, compareLane, chunkState, PIT_Y, YOU_Y, TAG_PIT, TAG_YOU } from './mirrorCompare.js'
import { measureTake } from './mirrorMeasure.js'
import { CHUNKS, DICTOR, STUDENT_CLEAN, STUDENT_MISSING, STUDENT_PAUSE } from './mirrorFixtures.js'

const take = { url: 'blob:take' }
const layoutFor = student => compareLayout({ chunks: CHUNKS, student: take, measure: measureTake({ dictor: DICTOR, student, chunks: CHUNKS }) })

describe('compareLayout: что на какой дорожке', () => {
  it('чистый дубль: на дорожках 0, 1, 2 по две пилюли — Пит сверху, ты снизу, обе залиты полностью, промахов нет', () => {
    const l = layoutFor(STUDENT_CLEAN)
    expect(l.pit.map(p => [p.i, p.lane, p.y, p.tag, p.fill])).toEqual([[0, 0, PIT_Y, TAG_PIT, 1], [1, 1, PIT_Y, TAG_PIT, 1], [2, 2, PIT_Y, TAG_PIT, 1]])
    expect(l.you.map(p => [p.i, p.lane, p.y, p.tag, p.fill, p.wrong, p.state])).toEqual([[0, 0, YOU_Y, TAG_YOU, 1, false, 'ok'], [1, 1, YOU_Y, TAG_YOU, 1, false, 'ok'], [2, 2, YOU_Y, TAG_YOU, 1, false, 'ok']])
    expect(PIT_Y).toBeLessThan(YOU_Y)
  })
  it('пропущенный кусок: пилюля «ты» пустая и с полосками промаха; остальные залиты; у Пита всё полное', () => {
    const l = layoutFor(STUDENT_MISSING)
    expect(l.you.map(p => [p.fill, p.wrong, p.state])).toEqual([[1, false, 'ok'], [0, true, 'missing'], [1, false, 'ok']])
    expect(l.pit.every(p => p.fill === 1 && !p.wrong)).toBe(true)
  })
  it('долгая пауза и нарушенный порядок: кусок сказан — пилюля залита «как есть», состояние записано', () => {
    const pause = layoutFor(STUDENT_PAUSE)
    expect(pause.you.map(p => p.state)).toEqual(['ok', 'ok', 'pause'])
    expect(pause.you.every(p => p.fill === 1 && !p.wrong)).toBe(true)
    const swapped = { words: [{ word: 'trying', conf: 1, start: 0.4, end: 0.9 }, { word: "i'm", conf: 1, start: 1, end: 1.3 }, { word: 'to', conf: 1, start: 1.4, end: 1.5 }, { word: 'learn', conf: 1, start: 1.5, end: 2 }], durationMs: 2500 }
    const order = layoutFor(swapped)
    expect(order.you.filter(p => p.state === 'order')).toHaveLength(2)
    expect(order.you.every(p => p.fill === 1)).toBe(true)
  })
  it('записи нет (сбой): только верхняя лента Пита; запись без url — тоже нет', () => {
    expect(compareLayout({ chunks: CHUNKS, student: null, measure: null }).you).toEqual([])
    expect(compareLayout({ chunks: CHUNKS, student: {}, measure: null }).you).toEqual([])
    expect(compareLayout({ chunks: CHUNKS }).pit).toHaveLength(3)
  })
  it('запись есть, измерений нет — куски считаются сказанными', () => {
    expect(compareLayout({ chunks: CHUNKS, student: take }).you.map(p => p.state)).toEqual(['ok', 'ok', 'ok'])
  })
  it('куски из двух слов — дорожки 0 и 1; из одного — средняя дорожка', () => {
    expect(compareLayout({ chunks: ['a b', 'c'], student: take }).pit.map(p => p.lane)).toEqual([0, 1])
    expect(compareLayout({ chunks: ['hello'], student: take }).you.map(p => p.lane)).toEqual([1])
    expect([compareLane(0, 1), compareLane(2, 3)]).toEqual([1, 2])
  })
  it('chunkState: приоритет потеряно > порядок > пауза', () => {
    const m = { missing: ['a'], order: { early: 'a', late: 'b' }, pauses: [{ before: 'b' }, { before: 'c' }] }
    expect(['a', 'b', 'c', 'd'].map(t => chunkState(t, m))).toEqual(['missing', 'order', 'pause', 'ok'])
    expect(chunkState('a', null)).toBe('ok')
  })
})
