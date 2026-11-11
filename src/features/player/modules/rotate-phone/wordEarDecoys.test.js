import { describe, it, expect } from 'vitest'
import { syllables, earDecoys, earPlan, earGrammar, EAR_GRAMMAR_MAX } from './wordEarDecoys.js'
import { parsePhones } from '../../../../shared/lib/vosk/phones/phoneTable.js'
import { EN_PHONES } from '../../../../shared/lib/vosk/phones/enPhones.js'
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

// v3.3.185: отчёт владельца — «house» без конца засчитан («hous, housy, houss, housh» не слова: модель их выбросила, в грамматике осталась цель + [unk])
describe('фонетические ловушки (таблица произношений загружена)', () => {
  const table = parsePhones(EN_PHONES)
  it('слово из таблицы — соседи по ЗВУКУ, настоящие слова: house → how, howl; nice → nigh, nine; короткие слова (cat, dog, book) тоже получают соседей', () => {
    expect(earDecoys(['house'], 'en', [], table)).toEqual(expect.arrayContaining(['how', 'howl']))
    expect(earDecoys(['house'], 'en', [], table).some(d => /^hous/.test(d))).toBe(false)
    expect(earDecoys(['nice'], 'en', [], table)).toEqual(expect.arrayContaining(['nigh', 'nine', 'knight']))
    for (const w of ['cat', 'dog', 'book']) expect(earDecoys([w], 'en', [], table).length).toBeGreaterThan(2)
    const p = earPlan(['House!'], 'en', [], table).words[0]
    expect(p).toMatchObject({ word: 'house', kind: 'звук', sure: true, dropped: [] })
    expect(p.took[0]).toBe('how') // сначала слова-начала
  })
  it('слова нет в таблице — по буквам, но только настоящие слова: не слова отброшены (модель выбросила бы их, а выброшенная ловушка — пустая фраза в грамматике)', () => {
    const p = earPlan(['housemilk'], 'en', [], table).words[0]
    expect(p.kind).toBe('буквы')
    expect(p.took).toEqual(expect.arrayContaining(['house', 'ho use']))
    expect(p.dropped).toEqual(expect.arrayContaining(['housemil', 'housemile']))
    for (const d of p.took) for (const w of d.split(' ')) expect(table.prons.has(w)).toBe(true)
  })
  it('таблицы нет (ещё грузится, русский язык) — поведение как раньше: буквенные варианты без проверки', () => {
    expect(earDecoys(['milk'], 'en', [], null)).toEqual(['mil', 'mile', 'mily', 'mils', 'milh', 'mill'])
    expect(earPlan(['milk'], 'en', [], null).words[0]).toMatchObject({ kind: 'буквы', sure: false, dropped: [] })
    expect(earDecoys(['cat', 'dog'], 'en', [], null)).toEqual([])
    expect(earDecoys(['интересный'], 'ru', [], table)).toEqual(earDecoys(['интересный'], 'ru', [], null)) // русская модель — свой механизм, таблица ни при чём
  })
  it('слова целей и слова фраз-целей в ловушки не идут; фраза-цель ловушек не получает; предел на грамматику держится', () => {
    const d = earDecoys(['yesterday', 'yes please'], 'en', ['yes', 'please'], table)
    expect(d.flatMap(x => x.split(' '))).not.toContain('yes')
    expect(d).toContain('yest')
    expect(earDecoys(['see you later'], 'en', [], table)).toEqual([])
    const many = earDecoys(['interesting', 'wonderful', 'beautiful', 'yesterday', 'remember', 'together', 'house', 'nice', 'window'], 'en', [], table)
    expect(many.length).toBeLessThanOrEqual(EAR_GRAMMAR_MAX)
    expect(new Set(many).size).toBe(many.length)
  })
})
