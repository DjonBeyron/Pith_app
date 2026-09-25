import { describe, it, expect } from 'vitest'
import {
  copyNodesForCard, draftDeckFromLesson, deckStatus, cardHasTask, makeEmptyCard, MIN_CARDS, appendToCard,
} from './reviewCardCopy.js'

// Урок: текст → выбор слова (верно → текст-итог, неверно → сигнал-спутник
// через signals) → итог. Плюс ответ-реплика на первое сообщение
const lesson = () => [
  { id: 'a', seq: 1, type: 'text', typeData: { text: { content: 'Вопрос' } },
    triggers: [{ id: 'ta', if: 'timer', ms: 2000, then: 'b' }] },
  { id: 'b', seq: 2, type: 'word_choice',
    typeData: { word_choice: { options: [{ id: 'o1', text: 'to', isCorrect: true }, { id: 'o2', text: 'for' }] } },
    triggers: [{ id: 'tb1', if: 'word_correct', then: 'c' }, { id: 'tb2', if: 'word_wrong', then: 'a' }] },
  { id: 'c', seq: 3, type: 'text', typeData: { text: { content: 'Итог', replyToSeq: 1 } },
    triggers: [{ id: 'tc', if: 'timer', ms: 2000, then: null }] },
  { id: 'd', seq: 4, type: 'phrase_assembly',
    typeData: { phrase_assembly: { words: ['I', 'am'], signals: [{ slot: 1, ref: 's' }] } },
    triggers: [{ id: 'td1', if: 'phrase_correct', then: null }, { id: 'td2', if: 'phrase_wrong', then: null }] },
  { id: 's', seq: 5, type: 'text', typeData: { text: { content: 'Подсказка' } },
    triggers: [{ id: 'ts', if: 'timer', ms: 2000, then: null }] },
]

describe('копия нод в карточку', () => {
  it('новые id, порядок как в уроке, seq с 1', () => {
    const out = copyNodesForCard(lesson(), ['b', 'a'])
    expect(out.map(n => n.type)).toEqual(['text', 'word_choice'])
    expect(out.map(n => n.seq)).toEqual([1, 2])
    expect(out.some(n => ['a', 'b'].includes(n.id))).toBe(false)
    expect(new Set(out.flatMap(n => n.triggers.map(t => t.id))).size).toBe(3)
  })

  it('переходы внутри карточки переписаны, наружу — обнулены', () => {
    const [a, b] = copyNodesForCard(lesson(), ['a', 'b'])
    expect(a.triggers[0].then).toBe(b.id)
    expect(b.triggers[0].then).toBe(null) // «верно» вело на c — его в карточке нет
    expect(b.triggers[1].then).toBe(a.id) // «неверно» вело на a — он в карточке
  })

  it('основной путь пропущенной ноды ведёт на следующую выбранную', () => {
    const [a, c] = copyNodesForCard(lesson(), ['a', 'c'])
    expect(a.triggers[0].then).toBe(c.id)
  })

  it('варианты ответа и их id — как в уроке (особые переходы по варианту целы)', () => {
    const [b] = copyNodesForCard(lesson(), ['b'])
    expect(b.typeData.word_choice.options.map(o => o.id)).toEqual(['o1', 'o2'])
  })

  it('спутник-сигнал едет в карточку сам, ref переписан', () => {
    const out = copyNodesForCard(lesson(), ['d'])
    expect(out.map(n => n.type)).toEqual(['phrase_assembly', 'text'])
    expect(out[0].typeData.phrase_assembly.signals).toEqual([{ slot: 1, ref: out[1].id }])
  })

  it('replyToSeq — на новый номер, если адресат в карточке, иначе снят', () => {
    const [, c] = copyNodesForCard(lesson(), ['a', 'c'])
    expect(c.typeData.text.replyToSeq).toBe(1)
    const [only] = copyNodesForCard(lesson(), ['c'])
    expect(only.typeData.text.replyToSeq).toBe(null)
  })

  it('урок не меняется (глубокая копия)', () => {
    const src = lesson()
    const [a] = copyNodesForCard(src, ['a'])
    a.typeData.text.content = 'правка'
    expect(src[0].typeData.text.content).toBe('Вопрос')
  })
})

describe('черновик колоды', () => {
  it('по карточке на задание, с контекстом перед ним', () => {
    const deck = draftDeckFromLesson(lesson())
    expect(deck).toHaveLength(2)
    expect(deck[0].nodes.map(n => n.type)).toEqual(['text', 'word_choice'])
    expect(deck[1].nodes.map(n => n.type)).toEqual(['phrase_assembly', 'text']) // + спутник
    expect(deck.every(cardHasTask)).toBe(true)
  })

  it('урок без заданий — пустой черновик', () => {
    expect(draftDeckFromLesson([lesson()[0]])).toEqual([])
    expect(draftDeckFromLesson(undefined)).toEqual([])
  })
})

describe('статус колоды', () => {
  const card = () => ({ id: 'x', nodes: [{ id: 'n' }] })
  it('нет / мало / достаточно; пустые карточки не считаются', () => {
    expect(deckStatus(undefined)).toBe('none')
    expect(deckStatus([makeEmptyCard()])).toBe('none')
    expect(deckStatus([card(), card()])).toBe('few')
    expect(deckStatus(Array.from({ length: MIN_CARDS }, card))).toBe('ok')
  })
})

describe('дописать в карточку', () => {
  it('новые ноды после старых, последняя старая ведёт на первую новую', () => {
    const card = copyNodesForCard(lesson(), ['a'])
    const more = copyNodesForCard(lesson(), ['b'])
    const out = appendToCard(card, more)
    expect(out.map(n => n.seq)).toEqual([1, 2])
    expect(out[0].triggers[0].then).toBe(out[1].id)
  })

  it('в пустую карточку — как есть; уже связанный переход не трогаем', () => {
    const copies = copyNodesForCard(lesson(), ['a', 'b'])
    expect(appendToCard([], copies).map(n => n.id)).toEqual(copies.map(n => n.id))
    const out = appendToCard(copies, copyNodesForCard(lesson(), ['c']))
    expect(out[1].triggers[0].then).toBe(out[2].id) // «верно» у b было пустым → на c
    expect(out[0].triggers[0].then).toBe(copies[1].id)
  })
})
