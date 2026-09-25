import { describe, it, expect } from 'vitest'
import { sourceRows, rowsFor, filterCounts, cardSummary, colorOf } from './reviewCardsView.js'
import { TYPE_COLOR } from '../canvas/nodeTypes.js'

// Урок: вопрос → выбери слово (верно → похвала, неверно → разбор; на ошибку
// сигнал-подсказка) → голосовое. Порядок в массиве перепутан нарочно
const lesson = () => [
  { id: 'v', seq: 5, type: 'audio', typeData: { audio: { text: 'Слушай' } }, triggers: [] },
  { id: 'q', seq: 1, type: 'text', typeData: { text: { content: 'Как сказать «пытаюсь»?' } },
    triggers: [{ id: 't1', if: 'timer', then: 'w' }] },
  { id: 'w', seq: 2, type: 'word_choice',
    typeData: { word_choice: {
      options: [{ id: 'o1', text: 'trying', isCorrect: true }, { id: 'o2', text: 'try' }],
      signals: [{ slot: 0, ref: 's' }],
    } },
    triggers: [{ id: 't2', if: 'word_correct', then: 'ok' }, { id: 't3', if: 'word_wrong', then: 'bad' }] },
  { id: 'ok', seq: 3, type: 'text', typeData: { text: { content: 'Отлично!' } }, triggers: [] },
  { id: 'bad', seq: 4, type: 'text', typeData: { text: { content: 'Не совсем' } }, triggers: [] },
  { id: 's', seq: 6, type: 'text', typeData: { text: { content: 'Подсказка' } }, triggers: [] },
]

describe('урок-источник', () => {
  it('строки по порядку урока, с цветом и коротким именем типа', () => {
    const rows = sourceRows(lesson())
    expect(rows.map(r => r.id)).toEqual(['q', 'w', 'ok', 'bad', 'v', 's'])
    expect(rows[1]).toMatchObject({ type: 'Слово', color: TYPE_COLOR.word_choice, isTask: true })
    expect(rows[4]).toMatchObject({ icon: '🔊', text: 'Слушай' })
  })

  it('варианты ответа задания, верный помечен', () => {
    expect(sourceRows(lesson())[1].answers).toEqual([{ text: 'trying', ok: true }, { text: 'try', ok: false }])
  })

  it('метки веток и подсказок', () => {
    const mark = Object.fromEntries(sourceRows(lesson()).map(r => [r.id, r.mark]))
    expect(mark).toEqual({ q: null, w: null, ok: 'ok', bad: 'bad', v: null, s: 'hint' })
  })

  it('возврат к вопросу на ошибку веткой не считается', () => {
    const nodes = lesson().map(n => (n.id === 'w'
      ? { ...n, triggers: [{ id: 't2', if: 'word_correct', then: 'ok' }, { id: 't3', if: 'word_wrong', then: 'q' }] }
      : n))
    expect(sourceRows(nodes).find(r => r.id === 'q').mark).toBe(null)
  })

  it('фильтры по типам и счётчики', () => {
    const rows = sourceRows(lesson())
    expect(filterCounts(rows)).toEqual({ all: 6, task: 1, text: 4, audio: 1, media: 0 })
    expect(rowsFor(rows, 'task').map(r => r.id)).toEqual(['w'])
    expect(rowsFor(rows, 'нет такого')).toHaveLength(6)
  })

  it('пустой урок', () => {
    expect(sourceRows(undefined)).toEqual([])
  })
})

describe('мини-превью карточки', () => {
  it('цвета нод по порядку, первый текст, число нод, есть ли задание', () => {
    const card = { id: 'c', nodes: [lesson()[2], lesson()[1]] }
    expect(cardSummary(card)).toEqual({
      colors: [TYPE_COLOR.text, TYPE_COLOR.word_choice],
      text: 'Как сказать «пытаюсь»?',
      count: 2,
      hasTask: true,
    })
  })

  it('пустая карточка', () => {
    expect(cardSummary({ id: 'e', nodes: [] })).toEqual({ colors: [], text: '', count: 0, hasTask: false })
  })

  it('неизвестный тип — цвет текста', () => {
    expect(colorOf({ type: 'нечто' })).toBe(TYPE_COLOR.text)
  })
})
