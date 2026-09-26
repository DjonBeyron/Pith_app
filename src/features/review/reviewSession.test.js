import { describe, it, expect } from 'vitest'
import {
  buildSession, startSession, currentItem, isFinished, wordDone, answerCard, dropAudio, wordOutcomes, maskWord, splitByWord, cardHasAudio,
} from './reviewSession.js'

const card = (id, types = ['word_choice']) => ({ id, nodes: types.map((type, i) => ({ id: `${id}-${i}`, type })) })
const decks = new Map([
  ['trying', { phrase: "I'm trying to cook", cards: [card('t1'), card('t2'), card('t3', ['audio', 'word_choice'])] }],
  ['cook',   { phrase: "I'm trying to cook", cards: [card('c1')] }],
])
const fixedRand = () => 0.1 // детерминированный порядок слов

describe('сборка сессии', () => {
  it('берёт столько карточек, сколько дал выбор дня, вперемешку по словам', () => {
    const s = buildSession([{ word: 'trying', cards: 2 }, { word: 'cook', cards: 1 }], decks, { rand: fixedRand })
    expect(s.items).toHaveLength(3)
    expect(s.words.sort()).toEqual(['cook', 'trying'])
    // две карточки trying не стоят рядом, пока есть cook
    const words = s.items.map(i => i.word)
    expect(words[0]).not.toBe(words[1])
  })

  it('ротация: начинает со следующей после показанной в прошлый раз', () => {
    const s = buildSession([{ word: 'trying', cards: 1 }], decks, { lastCardIds: { trying: 't1' } })
    expect(s.items[0].card.id).toBe('t2')
  })

  it('«Не могу слушать»: карточки со звуком не попадают; слово без карточек — пропадает', () => {
    const s = buildSession([{ word: 'trying', cards: 3 }], decks, { noAudio: true })
    expect(s.items.map(i => i.card.id)).toEqual(['t1', 't2'])
    expect(buildSession([{ word: 'нет', cards: 2 }], decks).items).toEqual([])
    expect(cardHasAudio(card('x', ['audio']))).toBe(true)
  })
})

describe('ответы в сессии', () => {
  const deck = decks.get('trying').cards
  const one = () => startSession(buildSession([{ word: 'trying', cards: 1 }], decks))

  it('ошибка возвращает слово в конец один раз — другой карточкой слова', () => {
    let s = answerCard(one(), { result: 'wrong', timeMs: 900 }, deck)
    expect(s.queue).toHaveLength(2)
    expect(wordDone(s, 'trying')).toBe(false) // повтор ещё впереди
    expect(currentItem(s).attempt).toBe(2)
    expect(currentItem(s).card.id).not.toBe(s.queue[0].card.id)
    s = answerCard(s, { result: 'correct', timeMs: 800 }, deck)
    expect(isFinished(s)).toBe(true)
    expect(wordDone(s, 'trying')).toBe(true)
    expect(wordOutcomes(s)).toMatchObject([{ word: 'trying', outcome: 'again' }])
  })

  it('вторая ошибка — ответ показан, в очередь больше не возвращается', () => {
    let s = answerCard(one(), { result: 'wrong' }, deck)
    s = answerCard(s, { result: 'wrong' }, deck)
    expect(isFinished(s)).toBe(true)
    expect(s.revealed).toHaveLength(1)
    expect(wordOutcomes(s)[0].outcome).toBe('fail')
  })

  it('верно с первого раза — good; «Знаю» — know; последняя показанная карточка запомнена', () => {
    const s = answerCard(one(), { result: 'correct', timeMs: 500 }, deck)
    expect(wordOutcomes(s)[0]).toMatchObject({ outcome: 'good', cardId: s.queue[0].card.id })
    expect(wordOutcomes(answerCard(one(), { result: 'know' }, deck))[0].outcome).toBe('know')
  })

  it('«Не могу слушать» посреди сессии убирает оставшиеся карточки со звуком', () => {
    let s = startSession(buildSession([{ word: 'trying', cards: 3 }], decks))
    s = answerCard(s, { result: 'correct' }, [])
    const before = s.queue.slice(s.index).length
    s = dropAudio(s)
    expect(s.queue.slice(s.index).every(q => !cardHasAudio(q.card))).toBe(true)
    expect(s.index).toBe(1)
    expect(s.queue.slice(s.index).length).toBeLessThanOrEqual(before)
  })
})

describe('фраза с закрытым словом', () => {
  it('закрывает слово целиком, без учёта регистра, не трогая другие слова', () => {
    expect(maskWord("I'm trying to cook", 'trying')).toBe("I'm ●●●●●● to cook")
    expect(maskWord('Cook the cookies', 'cook')).toBe('●●●● the cookies')
    expect(maskWord("I'm fine", "i'm")).toBe('●●● fine')
    expect(maskWord("I’m fine", "i'm")).toBe('●●● fine')
    expect(maskWord('Going to go', 'going to')).toBe('●●●●●●●● go')
  })

  it('после ответа слово подсвечивается на своём месте, регистр фразы сохранён', () => {
    expect(splitByWord('Trying to cook, trying!', 'trying')).toEqual([
      { text: 'Trying', hit: true }, { text: ' to cook, ', hit: false }, { text: 'trying', hit: true }, { text: '!', hit: false },
    ])
    expect(splitByWord('no match', 'cook')).toEqual([{ text: 'no match', hit: false }])
    expect(splitByWord('', 'cook')).toEqual([])
  })
})
