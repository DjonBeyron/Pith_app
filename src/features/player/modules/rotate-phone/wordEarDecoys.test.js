import { describe, it, expect } from 'vitest'
import { syllables, earDecoys, earGrammar, EAR_GRAMMAR_MAX } from './wordEarDecoys.js'
import { targetGrammar } from './wordLaneMatch.js'

// Ловушки честного зачёта слова (v3.3.183): слова-соседи цели в грамматике Vosk — у обрубка появляется своё слово («mil» → mill, «win» → win, «yester» → «yes ter»).
describe('слоги', () => {
  it('по группам гласных (немое e не считается), русские — по гласным', () => {
    expect(['cat', 'hello', 'water', 'love', 'table', 'wonderful', 'beautiful', 'interesting', 'yesterday', 'milk', 'window'].map(w => syllables(w))).toEqual([1, 2, 2, 1, 2, 3, 3, 4, 3, 1, 2])
    expect(['кот', 'привет', 'чудесный', 'интересный'].map(w => syllables(w, 'ru'))).toEqual([1, 2, 3, 4])
  })
})

describe('ловушки', () => {
  it('короткое слово: начала от 3 букв, кончающиеся согласной, и их варианты с типовым концом и удвоением («mil» → mill, mile, mils); у cat, dog, book, tree ловушек нет', () => {
    expect(earDecoys(['milk'])).toEqual(['mil', 'mile', 'mily', 'mils', 'milh', 'mill'])
    for (const w of ['win', 'wind', 'wins', 'winn', 'windy']) expect(earDecoys(['window'])).toContain(w)
    expect(earDecoys(['window', 'water']).some(x => /^(wi|wa|wah|windo)$/.test(x))).toBe(false) // начала на гласную перехватывали целое слово (water → «wah»)
    expect(earDecoys(['cat', 'dog', 'go', 'book', 'tree'])).toEqual([])
  })
  it('длинное слово: начала и двойные ловушки — начало, разбитое на два слова; вторая часть не дальше 75 % слова', () => {
    const d = earDecoys(['yesterday'])
    for (const w of ['yes', 'yest', 'yester', 'yes ter', 'ye st', 'yest er']) expect(d).toContain(w)
    expect(d.filter(x => x.includes(' ')).every(x => x.replace(' ', '').length <= Math.floor(9 * 0.75) + 1)).toBe(true) // + 1 — буква варианта конца
    expect(earDecoys(['window'])).not.toContain('win do') // «win do» звучит как window и перехватывало бы целое слово
    expect(earDecoys(['interesting'])).toEqual(expect.arrayContaining(['interest', 'inter', 'inter est', 'in ter']))
    expect(earDecoys(['beautiful'])).toContain('beauty')
  })
  it('ловушка не совпадает с целью и не содержит слов целей (и слов фраз-целей); фразы ловушек не получают', () => {
    expect(earDecoys(["i'm trying", 'hello there'])).toEqual([])
    const d = earDecoys(['together', 'to learn', 'tog'], 'en', ['to', 'learn'])
    expect(d.flatMap(x => x.split(' '))).not.toContain('to')
    expect(d).not.toContain('tog')
    expect(d).toContain('toge')
    expect(earDecoys(['Milk!'])).toContain('mill') // знаки и регистр цели не мешают
  })
  it('не больше EAR_GRAMMAR_MAX на грамматику — поровну на цель, сначала одиночные (от длинных начал)', () => {
    const one = earDecoys(['interesting'])
    expect(one.length).toBeLessThanOrEqual(EAR_GRAMMAR_MAX)
    expect(one.some(x => x.includes(' '))).toBe(true)
    const many = earDecoys(['interesting', 'wonderful', 'beautiful', 'yesterday', 'remember', 'together'])
    expect(many.length).toBeLessThanOrEqual(EAR_GRAMMAR_MAX)
    for (const w of ['interest', 'wonder', 'beauty', 'yester', 'remem', 'toget']) expect(many).toContain(w)
  })
  it('русская модель — как раньше: только начала (3 … длина − 2) слов от 6 букв и 2 слогов', () => {
    expect(earDecoys(['чудесный'], 'ru')).toEqual(['чудесн', 'чудес', 'чуде', 'чуд'])
    expect(earDecoys(['кот', 'привет'], 'ru')).toEqual(['прив', 'при'])
  })
  it('грамматика: ловушки — отдельными вариантами, варианты цели как были', () => {
    const base = targetGrammar(['wonderful'], 2)
    const g = JSON.parse(earGrammar(base, ['won', 'wonder', 'won der']))
    expect(g.slice(0, JSON.parse(base).length)).toEqual(JSON.parse(base))
    expect(g.slice(-3)).toEqual(['won', 'wonder', 'won der'])
    expect(earGrammar(base, [])).toBe(base)
  })
})
