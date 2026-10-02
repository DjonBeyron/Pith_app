import { describe, it, expect } from 'vitest'
import {
  buildSession, startSession, currentItem, isFinished, wordDone, answerCard, dropAudio, wordOutcomes, maskWord, splitByWord, cardHasAudio, cardNeedsSound, endsQueue,
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

  it('first — слово, с которого начинается сессия (цвет экрана загрузки совпадает с первой карточкой)', () => {
    const picked = [{ word: 'trying', cards: 1 }, { word: 'cook', cards: 1 }]
    for (const rand of [() => 0.1, () => 0.9]) {
      expect(buildSession(picked, decks, { rand, first: 'cook' }).items[0].word).toBe('cook')
      expect(buildSession(picked, decks, { rand, first: 'trying' }).items[0].word).toBe('trying')
    }
    expect(buildSession(picked, decks, { first: 'нет такого' }).items).toHaveLength(2) // незнакомое слово — просто игнор
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

// Голосовое с текстом играет беззвучно — карточка остаётся; без звука не обойтись видео, кружку, голосу ученика и голосовому без текста
describe('«Не могу слушать»: что убирается', () => {
  const voice = (id, text) => ({ id, nodes: [{ id: `${id}-a`, type: 'audio', typeData: { audio: { text } } }, { id: `${id}-w`, type: 'word_choice' }] })
  const withTypes = (id, type) => ({ id, nodes: [{ id: `${id}-n`, type }] })

  it('голосовое с текстом — остаётся, остальное со звуком — нужен звук', () => {
    expect(cardHasAudio(voice('v', 'Hello'))).toBe(true) // кнопка на карточке есть
    expect(cardNeedsSound(voice('v', 'Hello'))).toBe(false)
    expect(cardNeedsSound(voice('v', '   '))).toBe(true) // текста нет — слушать нечего без звука
    expect(cardNeedsSound(voice('v', undefined))).toBe(true)
    for (const type of ['video', 'circle', 'voice_record']) expect(cardNeedsSound(withTypes('x', type))).toBe(true)
    expect(cardNeedsSound(card('plain'))).toBe(false)
  })

  it('сборка без звука оставляет голосовые с текстом, убирает остальное', () => {
    const d = new Map([['w', { phrase: 'w', cards: [voice('v1', 'Hi'), withTypes('c1', 'circle'), voice('v2', ''), card('p1')] }]])
    const s = buildSession([{ word: 'w', cards: 4 }], d, { noAudio: true })
    expect(s.items.map(i => i.card.id)).toEqual(['v1', 'p1'])
  })

  it('dropAudio посреди сессии: голосовое с текстом остаётся, текущая и следующие со звуком уходят', () => {
    const d = new Map([['w', { phrase: 'w', cards: [voice('v1', 'Hi'), withTypes('c1', 'video'), card('p1')] }]])
    let s = startSession(buildSession([{ word: 'w', cards: 3 }], d))
    s = dropAudio(s)
    expect(s.queue.map(q => q.card.id)).toEqual(['v1', 'p1'])
    expect(currentItem(s).card.id).toBe('v1') // текущая не потеряна — продолжит играть беззвучно
  })
})

describe('последний ответ очереди', () => {
  const one = () => startSession(buildSession([{ word: 'trying', cards: 1 }], decks))

  it('последняя карточка — ответ завершает; ошибка с первой попытки — нет (вернётся повтор)', () => {
    const s = one()
    const item = currentItem(s)
    expect(endsQueue(s, item, 'correct')).toBe(true)
    expect(endsQueue(s, item, 'wrong')).toBe(false) // attempt 1: в очередь добавится повтор
    expect(endsQueue(s, { ...item, attempt: 2 }, 'wrong')).toBe(true)
  })

  it('не последняя карточка — нет', () => {
    const s = startSession(buildSession([{ word: 'trying', cards: 2 }, { word: 'cook', cards: 1 }], decks, { rand: () => 0.1 }))
    expect(endsQueue(s, currentItem(s), 'correct')).toBe(false)
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

  it('верно с первого раза — good; последняя показанная карточка запомнена', () => {
    const s = answerCard(one(), { result: 'correct', timeMs: 500 }, deck)
    expect(wordOutcomes(s)[0]).toMatchObject({ outcome: 'good', cardId: s.queue[0].card.id })
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
