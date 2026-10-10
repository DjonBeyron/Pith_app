import { describe, it, expect } from 'vitest'
import { buildSayGrammar, sayGrammarPhrases, isVoskPhrase, voskPhraseProblem, MAX_GRAMMAR_PHRASES, UNK } from './sayVoskGrammar.js'
import { readSayData } from '../speech/sayPhraseData.js'

const data = (o = {}) => readSayData({ phrase: "I'm trying", ...o })

describe('sayVoskGrammar: закрытый словарь из полей шага', () => {
  it("верная фраза первой, дальше — с неверной формой ключевого слова; в конце [unk]; «i'm» и «i am» — две записи", () => {
    const g = buildSayGrammar(data({ keywords: 'trying' }))
    expect(g.phrases).toEqual(["i'm trying", "i'm try", "i'm tried", "i'm tries"])
    expect(JSON.parse(g.json)).toEqual(["i'm trying", 'i am trying', "i'm try", 'i am try', "i'm tried", 'i am tried', "i'm tries", 'i am tries', UNK])
    expect(g.words).toEqual(expect.arrayContaining(['trying', 'try', 'tried', 'tries', "i'm", 'i', 'am']))
    expect(g.words).not.toContain(UNK)
  })
  it('ключевое слово ведёт: меняем только его (служебные слова не трогаем), регистр и знаки препинания фразы не мешают', () => {
    const p = sayGrammarPhrases(data({ phrase: 'She HAS a cat!', keywords: 'has' }))
    expect(p).toEqual(['she has a cat', 'she have a cat'])
  })
  it('нет ключевых слов — ошибочные формы строятся по ВСЕМ словам с формами: сначала «изменённые» (have, cats), потом остальные; числа и короткие слова не трогаем', () => {
    expect(sayGrammarPhrases(data({ phrase: 'I have two cats' }))).toEqual(['i have two cats', 'i has two cats', 'i have two cat'])
    expect(sayGrammarPhrases(data({ phrase: 'I play football' }))).toEqual(['i play football', 'i plays football', 'i play footballs', 'i played football', 'i play footballed', 'i playing football', 'i play footballing'])
    const hello = sayGrammarPhrases(data({ phrase: 'Hello, world!' }))
    expect(hello[0]).toBe('hello world')
    expect(hello).toEqual(expect.arrayContaining(['helloes world', 'hello worlds']))
  })
  it('без ключевых слов проверка формы работает у play / walk: plays / played / playing', () => {
    const p = sayGrammarPhrases(data({ phrase: 'We play here' }))
    expect(p).toEqual(expect.arrayContaining(['we plays here', 'we played here', 'we playing here']))
  })
  it('без ключевых слов формы идут по кругу: «изменённые» слова (plays, watches, films, morning) первыми; служебные слова (she, every, and) не трогаем', () => {
    const p = sayGrammarPhrases(data({ phrase: 'She plays tennis and watches films every morning' }))
    expect(p).toEqual([
      'she plays tennis and watches films every morning', 'she play tennis and watches films every morning', 'she plays tennis and watch films every morning',
      'she plays tennis and watches film every morning', 'she plays tennis and watches films every morn',
    ])
  })
  it('-es после ch / sh / x / ss: watches → watch (а не watche)', () => {
    expect(sayGrammarPhrases(data({ phrase: 'He watches it' }))).toContain('he watch it')
  })
  it('несколько ключевых слов: формы берутся по кругу, чтобы потолок не съел последнее слово; потолок MAX_GRAMMAR_PHRASES', () => {
    const long = data({ phrase: 'play walk talk cook watch read open clean', keywords: 'play, walk, talk, cook, watch, read, open, clean' })
    const p = sayGrammarPhrases(long)
    expect(p.length).toBe(MAX_GRAMMAR_PHRASES)
    expect(p[0]).toBe('play walk talk cook watch read open clean')
    expect(p.slice(1, 9).map(x => x.split(' ').findIndex((w, k) => w !== p[0].split(' ')[k]))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]) // первый круг: по подмене в каждом слове
    expect(sayGrammarPhrases(long, 5)).toHaveLength(5)
    expect(JSON.parse(buildSayGrammar(long).json).length).toBeLessThanOrEqual(MAX_GRAMMAR_PHRASES * 2 + 1)
  })
  it('ключевое слово, которого нет во фразе, игнорируется (как в проверке): остаются слова в «изменённой» форме', () => {
    const p = sayGrammarPhrases(data({ phrase: 'He goes home', keywords: 'banana' }))
    expect(p.slice(0, 3)).toEqual(['he goes home', 'he go home', 'he going home'])
  })
  it('пустая фраза → пустой словарь, только [unk]', () => {
    expect(sayGrammarPhrases(data({ phrase: '' }))).toEqual([])
    expect(JSON.parse(buildSayGrammar(data({ phrase: '' })).json)).toEqual([UNK])
  })
  it('порог и «Строго» словарь не меняют (они работают на оценке)', () => {
    const a = buildSayGrammar(data({ keywords: 'trying' })).json
    expect(buildSayGrammar(data({ keywords: 'trying', strict: true })).json).toBe(a)
    expect(buildSayGrammar(data({ keywords: 'trying', threshold: 90 })).json).toBe(a)
  })
  it('isVoskPhrase: латиница, пунктуация и простые числа — да; чужие буквы, сложные числа, пусто — нет (такие фразы идут на системное)', () => {
    for (const ok of ["I'm trying to please both.", 'Hello, world!', "It’s fine — really?", 'Well-done', 'I have 2 cats', 'It was 1998.', 'On the 21st', 'It costs $5', '50% off', 'At 3:30', 'Room 105']) expect(isVoskPhrase(ok), ok).toBe(true)
    for (const no of ['Привет', 'café', '', '   ', null, '...', 'Call 555-1234', 'It is 2.5', 'I have 12345', 'At 3:30 pm', 'mp3 player', 'a 5-year plan']) expect(isVoskPhrase(no), String(no)).toBe(false)
  })
  it('voskPhraseProblem: причина отказа — empty / chars / numbers', () => {
    expect(voskPhraseProblem('Hello')).toBe(null)
    expect(voskPhraseProblem('  ')).toBe('empty'); expect(voskPhraseProblem('...')).toBe('empty')
    expect(voskPhraseProblem('Привет')).toBe('chars'); expect(voskPhraseProblem('café')).toBe('chars')
    expect(voskPhraseProblem('It is 2.5')).toBe('numbers'); expect(voskPhraseProblem('Call 555-1234')).toBe('numbers')
  })
})

describe('sayVoskGrammar: числа в словаре', () => {
  it('цифра заменяется словом: «I have 2 cats» → i have two cats (в словаре цифр нет)', () => {
    const g = buildSayGrammar(data({ phrase: 'I have 2 cats' }))
    expect(g.phrases[0]).toBe('i have two cats')
    expect(g.json).not.toMatch(/\d/)
    expect(g.words).toEqual(expect.arrayContaining(['two', 'cats']))
  })
  it('год: основное прочтение первым, количество — вторым; «0»: zero и oh; «105»: с and и без', () => {
    expect(sayGrammarPhrases(data({ phrase: 'It was 1998' })).slice(0, 2)).toEqual(['it was nineteen ninety eight', 'it was one thousand nine hundred ninety eight'])
    expect(sayGrammarPhrases(data({ phrase: 'I have 0 cats' })).slice(0, 2)).toEqual(['i have zero cats', 'i have oh cats'])
    expect(sayGrammarPhrases(data({ phrase: 'Room 105' })).slice(0, 2)).toEqual(['room one hundred five', 'room one hundred and five'])
  })
  it('несколько чисел: прочтения идут от основного; всего не больше MAX_GRAMMAR_PHRASES; ошибочные формы слов-чисел не строятся (twos, fiveing)', () => {
    const p = sayGrammarPhrases(data({ phrase: 'From 1998 to 2005 I have 0 cats and 2 dogs' }))
    expect(p[0]).toBe('from nineteen ninety eight to two thousand five i have zero cats and two dogs')
    expect(p.length).toBeLessThanOrEqual(MAX_GRAMMAR_PHRASES)
    expect(p.join(' ')).not.toMatch(/\b(twos|twoed|twoing|zeros|fives)\b/)
    expect(p.slice(0, 6)).toEqual(expect.arrayContaining(['from one thousand nine hundred ninety eight to two thousand five i have zero cats and two dogs']))
  })
  it('порядковые, проценты, валюта, время', () => {
    expect(sayGrammarPhrases(data({ phrase: 'The 21st' }))[0]).toBe('the twenty first')
    expect(sayGrammarPhrases(data({ phrase: '50% off' }))[0]).toBe('fifty percent off')
    expect(sayGrammarPhrases(data({ phrase: '$5 please' }))[0]).toBe('five dollars please')
    expect(sayGrammarPhrases(data({ phrase: 'At 3:30' })).slice(0, 1)).toEqual(['at three thirty'])
  })
})
