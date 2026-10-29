// «Повтори за диктором»: сокращения в обеих записях (i'm ≡ i am) — и в закрытом словаре Vosk, и в сопоставлении услышанного с целями.
import { describe, it, expect } from 'vitest'
import { analyzeTargets, analyzeHeard, targetGrammar, wordGrammar } from './wordLaneMatch.js'
import { CONTRACTIONS, phraseForms, tokenize } from '../../../../shared/lib/speech/speechMatch.js'

// сокращение → раздельная запись (то, что просит владелец: «i'm» и «i am» — одно и то же)
const PAIRS = [
  ["i'm", 'i am'], ["you're", 'you are'], ["we're", 'we are'], ["they're", 'they are'], ["it's", 'it is'], ["he's", 'he is'], ["that's", 'that is'],
  ["don't", 'do not'], ["doesn't", 'does not'], ["didn't", 'did not'], ["can't", 'can not'], ['cannot', 'can not'], ["won't", 'will not'], ["isn't", 'is not'],
  ["we'll", 'we will'], ["i'll", 'i will'], ["i've", 'i have'], ["i'd", 'i would'], ["let's", 'let us'], ["haven't", 'have not'],
]

describe('phraseForms: записи фразы для словаря', () => {
  it('раздельная первой, затем слитная', () => {
    expect(phraseForms("I'm trying")).toEqual(['i am trying', "i'm trying"])
    expect(phraseForms('I am trying')).toEqual(['i am trying', "i'm trying"])
    expect(phraseForms("It's")).toEqual(['it is', "it's"])
    expect(phraseForms('let us go')).toEqual(['let us go', "let's go"])
  })
  it("can not / cannot / can't — три записи; без сокращений — одна; пусто — пусто", () => {
    expect(phraseForms("can't go")).toEqual(['can not go', "can't go", 'cannot go'])
    expect(phraseForms('try')).toEqual(['try'])
    expect(phraseForms('Get up!')).toEqual(['get up'])
    expect(phraseForms('')).toEqual([])
  })
  it('несколько мест: смешанные записи; слишком много мест — только две крайние', () => {
    expect(phraseForms("I'm sure it's fine")).toEqual(['i am sure it is fine', "i am sure it's fine", "i'm sure it is fine", "i'm sure it's fine"])
    const many = Array(5).fill("I'm sure it's fine").join(' ')
    expect(phraseForms(many)).toHaveLength(2)
    expect(phraseForms(many)[1]).toContain("i'm sure it's fine i'm")
  })
  it('наложение («it is not») не ломает', () => {
    expect(phraseForms('it is not')[0]).toBe('it is not')
    expect(phraseForms('it is not').sort()).toEqual(["it isn't", "it's not", 'it is not'].sort())
  })
  it("разговорные gonna/wanna/ain't в словарь не просим (tokenize их понимает по-прежнему)", () => {
    expect(phraseForms('going to go')).toEqual(['going to go'])
    expect(phraseForms('I want to go')).toEqual(['i want to go'])
    expect(tokenize('gonna go')).toEqual(['going', 'to', 'go'])
  })
  it('все сокращения таблицы, кроме разговорных, получают слитную запись', () => {
    for (const [c, full] of Object.entries(CONTRACTIONS)) {
      if (["ain't", 'gonna', 'wanna', 'gotta'].includes(c)) continue
      expect(phraseForms(full), full).toContain(c)
    }
  })
})

describe('закрытый словарь: обе записи цели', () => {
  it("цель «I'm trying» — и «i am trying», и «i'm trying»; повторы — в обеих", () => {
    const g = JSON.parse(targetGrammar(["I'm trying"], 2))
    expect(g).toContain('i am trying')
    expect(g).toContain("i'm trying")
    expect(g).toContain("i'm trying i am trying")
    expect(g).toContain("i am trying i'm trying")
    expect(g).toContain("i'm trying [unk]")
    expect(g.at(-1)).toBe('[unk]')
  })
  it('то же самое для цели «I am trying» (записано раздельно)', () => {
    const g = JSON.parse(targetGrammar(['I am trying'], 1))
    expect(g).toEqual(['i am trying', "i'm trying", '[unk]', '[unk]'])
  })
  it('каждая пара из таблицы: в словарь попадают обе записи, независимо от того, как записана цель', () => {
    for (const [c, full] of PAIRS) {
      for (const target of [c, full]) {
        const g = JSON.parse(targetGrammar([target], 1))
        expect(g, target).toContain(full)
        expect(g, target).toContain(c)
      }
    }
  })
  it("цели «I'm», «trying», «to learn»: пять записей в уровне — 5 + 25 + 125 + [unk]", () => {
    expect(JSON.parse(targetGrammar(["I'm", 'trying', 'to learn'], 3)).length).toBe(5 + 25 + 125 + 1)
  })
  it('known: записи со словами, которых нет в словаре модели, не просим', () => {
    const known = w => w !== "can't" && w !== 'cannot'
    expect(JSON.parse(targetGrammar(["can't"], 1, known))).toEqual(['can not', '[unk]', '[unk]'])
    expect(JSON.parse(targetGrammar(["can't"], 1))).toEqual(['can not', "can't", 'cannot', '[unk]', '[unk]'])
    expect(targetGrammar(['x'], 1, () => false)).toBeNull()
  })
  it('словарь одного слова (wordGrammar) — тоже в обеих записях', () => {
    expect(JSON.parse(wordGrammar("I'm", 1))).toEqual(['i am', "i'm", '[unk]', '[unk]'])
    expect(JSON.parse(wordGrammar('try', 1))).toEqual(['try', '[unk]', '[unk]'])
  })
})

describe('сопоставление: слитная и раздельная записи — одна цель', () => {
  const T = ["I'm trying"]
  it("«i'm trying» и «i am trying» на цель «I'm trying» дают одинаковый результат (итог и черновик)", () => {
    for (const final of [true, false]) {
      expect(analyzeTargets("i'm trying", T, final)).toEqual(analyzeTargets('i am trying', T, final))
      expect(analyzeTargets("i'm trying", T, final)).toEqual({ seq: [0], misses: 0, tail: null })
    }
  })
  it("обратный случай: цель «I am trying», сказано «i'm trying» — засчитано", () => {
    const R = ['I am trying']
    expect(analyzeTargets("i'm trying", R)).toEqual({ seq: [0], misses: 0, tail: null })
    expect(analyzeTargets('i am trying', R)).toEqual({ seq: [0], misses: 0, tail: null })
    expect(analyzeTargets("i'm trying i am trying i'm trying", R).seq).toEqual([0, 0, 0])
  })
  it("цель — одно сокращение: «i'm» и «i am» — по одному попаданию; повторы считаются", () => {
    expect(analyzeTargets("i'm", ["I'm"])).toMatchObject({ seq: [0], misses: 0 })
    expect(analyzeTargets('i am', ["I'm"])).toMatchObject({ seq: [0], misses: 0 })
    expect(analyzeTargets("i'm i am i'm", ["I'm"]).seq).toEqual([0, 0, 0])
    expect(analyzeTargets("i'm i am", ['I am'])).toMatchObject({ seq: [0, 0], misses: 0 })
  })
  it("недосказанная цель: «i'm» из «i'm trying» — начало, а не промах", () => {
    expect(analyzeTargets("i'm", T, false)).toEqual({ seq: [], misses: 0, tail: { target: 0, tokens: 2 } })
    expect(analyzeTargets('i am', T, false)).toEqual({ seq: [], misses: 0, tail: { target: 0, tokens: 2 } })
    expect(analyzeTargets("cat i'm", T, false)).toEqual({ seq: [], misses: 1, tail: { target: 0, tokens: 2 } })
  })
  it("слово из середины записи отдельно не засчитывается: «am» внутри «i'm» — не цель «am»", () => {
    expect(analyzeTargets("i'm", ['am'], true)).toMatchObject({ seq: [] })
    expect(analyzeTargets('am', ['am'], true)).toMatchObject({ seq: [0], misses: 0 })
  })
  it('чужое слово рядом — по-прежнему промах', () => {
    expect(analyzeTargets("cat i'm trying", T)).toMatchObject({ seq: [0], misses: 1 })
    expect(analyzeTargets("i'm trying [unk]", T)).toMatchObject({ seq: [0], misses: 1 })
  })
  it('таблица: каждое сокращение и его раздельная запись дают одинаковый seq на обе записи цели', () => {
    for (const [c, full] of PAIRS) {
      for (const target of [`${c} go`, `${full} go`]) {
        const a = analyzeTargets(`${c} go`, [target])
        const b = analyzeTargets(`${full} go`, [target])
        expect(a, `${c} → ${target}`).toEqual({ seq: [0], misses: 0, tail: null })
        expect(b, `${full} → ${target}`).toEqual(a)
      }
    }
    for (const said of ['cannot go', 'can not go', "can't go"]) expect(analyzeTargets(said, ['cannot go']).seq, said).toEqual([0])
  })
  it("«it's» ≡ «it is», но не «it has»; «let's» ≡ «let us»", () => {
    expect(analyzeTargets("it's", ['it is']).seq).toEqual([0])
    expect(analyzeTargets('it has', ["it's"]).seq).toEqual([])
    expect(analyzeTargets("let's", ['let us']).seq).toEqual([0])
  })
  it("analyzeHeard (одно слово): «i'm» и «i am» — одно попадание", () => {
    expect(analyzeHeard("i'm i am i'm", "I'm")).toEqual({ hits: 3, misses: 0 })
    expect(analyzeHeard("i'm i am", 'I am')).toEqual({ hits: 2, misses: 0 })
    expect(analyzeHeard("i'm [unk]", "I'm", true)).toEqual({ hits: 1, misses: 1 })
  })
})
