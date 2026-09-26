import { describe, it, expect, beforeEach } from 'vitest'
import { exportLesson } from '../canvas/lesson-io/exportLesson.js'
import { importLesson } from '../canvas/lesson-io/importLesson.js'
import { copyNodesForCard } from './reviewCardCopy.js'

// Колода повтора в обменном JSON урока: экспорт → импорт сохраняет карточки,
// переходы и сигналы внутри каждой карточки (ref локальны для карточки)

beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  }
})

const lesson = () => [
  { id: 'a', seq: 1, x: 0, y: 0, type: 'text', typeData: { text: { content: 'Вопрос' } },
    triggers: [{ id: 'ta', if: 'timer', ms: 2000, then: 'b' }] },
  { id: 'b', seq: 2, x: 370, y: 0, type: 'phrase_assembly',
    typeData: { phrase_assembly: { words: ['I', 'am'], signals: [{ slot: 1, ref: 's' }] } },
    triggers: [{ id: 'tb1', if: 'phrase_correct', then: null }, { id: 'tb2', if: 'phrase_wrong', then: null }] },
  { id: 's', seq: 3, x: 740, y: 0, type: 'text', typeData: { text: { content: 'Подсказка' } },
    triggers: [{ id: 'ts', if: 'timer', ms: 2000, then: null }] },
]

describe('колода в JSON урока', () => {
  it('экспорт: reviewCards с локальными ref, пустые карточки выброшены', () => {
    const card = { id: 'c1', nodes: copyNodesForCard(lesson(), ['a', 'b']) }
    const out = exportLesson(lesson(), { reviewCards: [card, { id: 'c2', nodes: [] }] })
    expect(out.reviewCards).toHaveLength(1)
    expect(out.reviewCards[0].nodes.map(n => n.ref)).toEqual(['n1', 'n2', 'n3'])
    expect(out.reviewCards[0].nodes[0].triggers[0].then).toBe('n2')
    expect(out.reviewCards[0].nodes[1].data.signals).toEqual([{ slot: 1, ref: 'n3' }])
    expect(exportLesson(lesson()).reviewCards).toBeUndefined()
  })

  it('импорт: карточки собраны, связи и сигналы — на новые id внутри карточки', () => {
    const card = { id: 'c1', nodes: copyNodesForCard(lesson(), ['a', 'b']) }
    const json = exportLesson(lesson(), { reviewCards: [card] })
    const r = importLesson(json)
    expect(r.reviewCards).toHaveLength(1)
    const [a, b, s] = r.reviewCards[0].nodes
    expect([a.type, b.type, s.type]).toEqual(['text', 'phrase_assembly', 'text'])
    expect(a.triggers[0].then).toBe(b.id)
    expect(b.typeData.phrase_assembly.signals).toEqual([{ slot: 1, ref: s.id }])
    expect(r.nodes).toHaveLength(3) // сам урок не пострадал
  })

  it('битая карточка — предупреждение, остальной файл импортируется', () => {
    const json = exportLesson(lesson())
    json.reviewCards = [{ nodes: [{ ref: 'n1', type: 'нет-такого' }] }]
    const r = importLesson(json)
    expect(r.reviewCards).toEqual([])
    expect(r.warnings.some(w => w.startsWith('карточка 1:'))).toBe(true)
    expect(r.nodes).toHaveLength(3)
  })

  it('легенда описывает reviewCards', () => {
    expect(exportLesson(lesson()).legend.reviewCards.about).toMatch(/Колода/)
  })
})
