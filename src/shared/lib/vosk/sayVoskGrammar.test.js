import { describe, it, expect } from 'vitest'
import { buildSayGrammar, sayGrammarPhrases, isVoskPhrase, MAX_GRAMMAR_PHRASES, UNK } from './sayVoskGrammar.js'
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
  it('нет ключевых слов — меняются слова в «изменённой» форме (trying, goes, cats); hello / world не размножаются', () => {
    expect(sayGrammarPhrases(data({ phrase: 'I have two cats' }))).toEqual(['i have two cats', 'i has two cats', 'i have two cat'])
    expect(sayGrammarPhrases(data({ phrase: 'Hello, world!' }))).toEqual(['hello world'])
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
    expect(sayGrammarPhrases(data({ phrase: 'He goes home', keywords: 'banana' }))).toEqual(['he goes home', 'he go home', 'he going home'])
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
  it('isVoskPhrase: латиница и пунктуация — да; цифры, кириллица, пусто — нет (такие фразы идут на системное)', () => {
    for (const ok of ["I'm trying to please both.", 'Hello, world!', "It’s fine — really?", 'Well-done']) expect(isVoskPhrase(ok), ok).toBe(true)
    for (const no of ['I have 2 cats', 'Привет', 'café', '', '   ', null]) expect(isVoskPhrase(no), String(no)).toBe(false)
  })
})
