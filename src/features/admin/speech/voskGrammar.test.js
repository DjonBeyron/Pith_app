import { describe, it, expect } from 'vitest'
import { buildGrammar, grammarWords, diffKeys, ctxSpec, pairSpec, PAIR_PRESETS, UNK } from './voskGrammar.js'

describe('словарь Vosk: два стиля', () => {
  it('«Фразы целиком»: верная фраза, фразы с ошибками try/tried/tries и [unk] в конце', () => {
    const g = JSON.parse(ctxSpec(1, 'error', 'phrases').grammar)
    expect(g).toContain("i'm trying")
    expect(g).toContain("i'm try")
    expect(g).toContain("i'm tried")
    expect(g).toContain("i'm tries")
    expect(g.at(-1)).toBe(UNK)
    expect(g.every(p => p === UNK || p.split(' ').length >= 1)).toBe(true)
    expect(g).not.toContain('try') // целые фразы, слов отдельно нет
  })
  it('«По словам»: все слова фраз и ошибочных форм по отдельности, порядок свободный', () => {
    const g = JSON.parse(ctxSpec(3, 'error', 'words').grammar)
    for (const w of ['trying', 'try', 'tried', 'tries', 'to', 'please', 'both', "i'm"]) expect(g).toContain(w)
    expect(g).not.toContain("i'm try") // фраз целиком нет
    expect(g.at(-1)).toBe(UNK)
    expect(new Set(g).size).toBe(g.length)
  })
  it('шаг 1 — одно слово: словарь try / trying / tried / tries / [unk]', () => {
    expect(JSON.parse(ctxSpec(0, 'control', 'phrases').grammar)).toEqual(['trying', 'try', 'tried', 'tries', UNK])
  })
  it('что говорим: с ошибкой — «I\'m try», контроль — «I\'m trying»; ключевое слово шага', () => {
    const e = ctxSpec(1, 'error', 'phrases')
    const c = ctxSpec(1, 'control', 'phrases')
    expect(e.said).toBe("I'm try")
    expect(e.keys).toEqual({ say: 'try', ok: 'trying', bad: ['try', 'tried', 'tries'] })
    expect(c.said).toBe("I'm trying")
    expect(c.keys.say).toBe('trying')
    expect(ctxSpec(3, 'error', 'phrases').said).toBe("I'm try to please both")
  })
  it('слова словаря без [unk]', () => {
    expect(grammarWords('["try","trying","[unk]"]')).toEqual(['try', 'trying'])
    expect(grammarWords('["i am try","[unk]"]')).toEqual(['i', 'am', 'try'])
    expect(grammarWords('не json')).toEqual([])
  })
})

describe('пары форм', () => {
  it('ключевое слово пары: go/goes, has/have, are/is, play/played, cat/cats', () => {
    const k = Object.fromEntries(PAIR_PRESETS.map(p => [p.id, diffKeys(p.ok, p.bad)]))
    expect(k.goes).toEqual({ okKey: 'goes', badKey: 'go' })
    expect(k.has).toEqual({ okKey: 'has', badKey: 'have' })
    expect(k.are).toEqual({ okKey: 'are', badKey: 'is' })
    expect(k.ed).toEqual({ okKey: 'played', badKey: 'play' })
    expect(k.cats).toEqual({ okKey: 'cats', badKey: 'cat' })
  })
  it('фразы разной длины: слова, которых нет в другой фразе', () => {
    expect(diffKeys('I played tennis', 'I play tennis yesterday')).toEqual({ okKey: 'played', badKey: 'play' })
    expect(diffKeys('', '')).toEqual({ okKey: '', badKey: '' })
  })
  it('спецификация пары: словарь, что говорим, ключи', () => {
    const p = PAIR_PRESETS[0]
    const e = pairSpec(p, 'error', 'phrases')
    expect(JSON.parse(e.grammar)).toEqual(['he goes to school', 'he go to school', UNK])
    expect(e.said).toBe('He go to school')
    expect(e.keys).toEqual({ say: 'go', ok: 'goes', bad: ['go'] })
    const c = pairSpec(p, 'control', 'words')
    expect(c.said).toBe('He goes to school')
    expect(c.keys.say).toBe('goes')
    expect(JSON.parse(c.grammar)).toEqual(['he', 'goes', 'to', 'school', 'go', UNK])
  })
  it('buildGrammar без ошибочных форм не падает', () => {
    expect(JSON.parse(buildGrammar('phrases', 'Hello world'))).toEqual(['hello world', UNK])
  })
})
