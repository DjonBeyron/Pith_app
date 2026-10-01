import { describe, it, expect, beforeEach } from 'vitest'
import { exportLesson } from '../canvas/lesson-io/exportLesson.js'
import { importLesson } from '../canvas/lesson-io/importLesson.js'
import { wordCardToJson, wordCardFromJson } from './wordCardIo.js'
import { normalizeWordCard } from './wordCardModel.js'

// Справка слова в обменном JSON урока: экспорт → импорт сохраняет блоки, служебные id
// в файл не попадают, битое отбрасывается с предупреждением, а не отказом всего файла

beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  }
})

const lessonNodes = () => [
  { id: 'a', seq: 1, x: 0, y: 0, type: 'text', typeData: { text: { content: 'Привет' } }, triggers: [] },
]

const card = () => normalizeWordCard({
  tag: 'служебное слово',
  nodes: [
    { id: 'b1', type: 'text', text: 'После **to** идёт действие' },
    { id: 'b2', type: 'dialog', lines: [
      { side: 'l', text: 'I want **to** cook', tr: 'Я хочу готовить', neg: false },
      { side: 'r', text: 'I don’t want **to** wait', tr: 'Я не хочу ждать', neg: true },
    ] },
  ],
})

describe('справка слова в JSON урока', () => {
  it('экспорт: wordCard без служебных id; нет справки — нет поля', () => {
    const out = exportLesson(lessonNodes(), { wordCard: card() })
    expect(out.wordCard.tag).toBe('служебное слово')
    expect(out.wordCard.nodes).toHaveLength(2)
    expect(out.wordCard.nodes.every(b => !('id' in b))).toBe(true)
    expect(exportLesson(lessonNodes()).wordCard).toBeUndefined()
    expect(exportLesson(lessonNodes(), { wordCard: { nodes: [] } }).wordCard).toBeUndefined()
  })

  it('экспорт → импорт: блоки на месте, у них снова есть id', () => {
    const r = importLesson(exportLesson(lessonNodes(), { wordCard: card() }))
    expect(r.wordCard.tag).toBe('служебное слово')
    expect(r.wordCard.nodes.map(b => b.type)).toEqual(['text', 'dialog'])
    expect(r.wordCard.nodes.every(b => typeof b.id === 'string' && b.id)).toBe(true)
    expect(r.wordCard.nodes[1].left).toBe('Пит')
    expect(r.wordCard.nodes[1].lines[1].neg).toBe(true)
    expect(r.warnings).toEqual([])
    expect(r.nodes).toHaveLength(1) // сам урок не пострадал
  })

  it('без поля wordCard в файле — справки нет, предупреждений нет', () => {
    const r = importLesson(exportLesson(lessonNodes()))
    expect(r.wordCard).toBeNull()
    expect(r.warnings).toEqual([])
  })

  it('битые блоки выбрасываются с предупреждением, годные остаются', () => {
    const r = importLesson({ ...exportLesson(lessonNodes()), wordCard: { nodes: [{ type: 'нет-такого' }, { type: 'text', text: 'ок' }] } })
    expect(r.wordCard.nodes).toHaveLength(1)
    expect(r.warnings.some(w => w.startsWith('справка слова:') && w.includes('1 блок'))).toBe(true)
  })

  it('ни одного годного блока — справку не применяем, файл импортируется', () => {
    const r = importLesson({ ...exportLesson(lessonNodes()), wordCard: { nodes: [{ type: 'нет-такого' }] } })
    expect(r.wordCard).toBeNull()
    expect(r.warnings.some(w => w.includes('нет ни одного годного блока'))).toBe(true)
    expect(r.nodes).toHaveLength(1)
  })

  it('диалог без реплики-отрицания — мягкое замечание', () => {
    const { warnings } = wordCardFromJson({ nodes: [{ type: 'dialog', lines: [{ side: 'l', text: 'I want **to** go', tr: 'Я хочу идти' }] }] })
    expect(warnings.some(w => w.includes('neg: true'))).toBe(true)
    expect(wordCardFromJson({ nodes: [{ type: 'dialog', lines: [{ side: 'l', text: 'I don’t', tr: 'Я не', neg: true }] }] }).warnings).toEqual([])
  })

  it('wordCardToJson(null) и wordCardFromJson(null) — пусто', () => {
    expect(wordCardToJson(null)).toBeNull()
    expect(wordCardFromJson(undefined)).toEqual({ card: null, warnings: [] })
  })

  it('легенда описывает wordCard', () => {
    expect(exportLesson(lessonNodes()).legend.wordCard.about).toMatch(/Справка слова/)
  })
})
