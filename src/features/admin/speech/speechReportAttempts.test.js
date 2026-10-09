import { describe, it, expect } from 'vitest'
import { analyzeAttempt } from './antiPredictRules.js'
import {
  buildAttemptTexts, thinTexts, attemptLine, attemptFields, attemptsBlock, allComparisonsText, changesText, TX_LIMITS,
} from './speechReportAttempts.js'

const REF = "I'm trying"
const WRONG = ["I'm try", "I'm tried", "I'm tries"]
const a = (text, confidence) => ({ text, confidence })

// Случай пользователя: говорил «I'm try»; interim «I'm try» → «I'm trying»; итог «I'm trying» 86%, среди гипотез «i'm try» 36
function makeView(over = {}) {
  return {
    runNo: 2, reference: REF, lang: 'en-US',
    final: a("I'm trying", 0.86), alternatives: [a("I'm trying", 0.86), a("i'm try", 0.36), a("i'll try", 0.1)],
    history: [{ t: 1000, text: "I'm try" }, { t: 2200, text: "I'm trying", final: true }],
    lastInterim: "I'm try", applied: { lang: 'en-US' }, ...over,
  }
}
const extra = { modes: ['alts', 'history'], said: "I'm try", wrong: WRONG }
const entry = (view = makeView(), ex = extra, over = {}) => {
  const an = analyzeAttempt({ reference: view.reference, wrong: ex.wrong, final: view.final, alternatives: view.alternatives, history: view.history, lastInterim: view.lastInterim })
  return { t: 1, run: 2, retry: 0, tx: buildAttemptTexts(view, ex, an), ...over }
}

describe('buildAttemptTexts: что сохраняется в журнале', () => {
  const tx = entry().tx
  it('эталон, said, язык, режимы, top-1 и N-best с уверенностью', () => {
    expect(tx).toMatchObject({ ref: REF, said: "I'm try", lang: 'en-US', modes: ['alts', 'history'] })
    expect(tx.top1).toEqual({ text: "I'm trying", conf: 86 })
    expect(tx.alts.map(x => [x.text, x.conf])).toEqual([["I'm trying", 86], ["i'm try", 36], ["i'll try", 10]])
  })
  it('изменение try→trying (interim→final), литеральная форма — в alt#2, alt#3 и interim@1.0s, вердикты и вид «говорил»', () => {
    expect(tx.changes).toEqual([{ kind: 'replace', from: 'try', to: 'trying', at: 2200, step: 'interim→final' }])
    expect(tx.literal).toEqual(['alt#2', 'alt#3', 'interim@1.0s'])
    expect(tx.verdicts).toEqual({ top1: true, consensus: false, strict: false })
    expect(tx.saidKind).toBe('wrong')
    expect(tx.fixed).toBe(true)
    expect(tx.histN).toBe(1)
  })
  it('нет итога и нет interim → null; нет итога, но есть interim → запись без top-1', () => {
    expect(buildAttemptTexts(makeView({ final: null, alternatives: [], history: [], lastInterim: '' }), extra, null)).toBeNull()
    const t = buildAttemptTexts(makeView({ final: null, alternatives: [], history: [{ t: 500, text: 'I am' }], lastInterim: 'I am' }), extra, null)
    expect(t.top1).toBeNull()
    expect(t.hist).toHaveLength(1)
  })
  it('лимиты: длинные тексты режутся, N-best ≤ 10, история ≤ 12', () => {
    const long = 'word '.repeat(80)
    const history = Array.from({ length: 40 }, (_, i) => ({ t: i * 100, text: `${long}${i}` }))
    const alts = Array.from({ length: 14 }, (_, i) => a(`${long}${i}`, 0.5))
    const v = makeView({ reference: long, final: alts[0], alternatives: alts, history, lastInterim: long })
    const t = entry(v, { ...extra, said: long }).tx
    expect(t.ref.length).toBeLessThanOrEqual(TX_LIMITS.ref)
    expect(t.said.length).toBeLessThanOrEqual(TX_LIMITS.said)
    expect(t.alts).toHaveLength(TX_LIMITS.nAlts)
    expect(t.alts[0].text.length).toBeLessThanOrEqual(TX_LIMITS.alt)
    expect(t.hist.length).toBeLessThanOrEqual(TX_LIMITS.nHist)
    expect(JSON.stringify(t).length).toBeLessThan(6000)
  })
})

describe('thinTexts: самые «изменчивые» interim', () => {
  it('оставляет первый, последний и тексты, где слово менялось (а не просто росло)', () => {
    const list = [{ text: 'a' }, { text: 'a b' }, { text: 'a b c' }, { text: 'a b cc' }, { text: 'a b cc d' }, { text: 'a b cc d e' }, { text: 'a b cc d e f' }]
    const r = thinTexts(list, 4).map(x => x.text)
    expect(r).toHaveLength(4)
    expect(r[0]).toBe('a')
    expect(r.at(-1)).toBe('a b cc d e f')
    expect(r).toContain('a b c')
    expect(r).toContain('a b cc')
  })
  it('короткий список не трогаем', () => { expect(thinTexts([{ text: 'a' }], 12)).toEqual([{ text: 'a' }]) })
})

describe('компактный формат строки', () => {
  const line = attemptLine(entry())
  it('№ | ref | said | lang | modes | top1 | alts | interim-история | final-vs-interim | вердикты', () => {
    expect(line).toBe([
      '№2', `ref=«${REF}»`, "said=«I'm try»", 'en-US', 'alts+history', "top1=«I'm trying» 86%", "alts=«i'm try» 36 · «i'll try» 10",
      "interim-история: 1.0s «I'm try» → 2.2s «I'm trying» [final]",
      'final-vs-interim: try→trying (interim→final)', 'литерально: alt#2, alt#3, interim@1.0s',
      'вердикты: top1=пропустило consensus=поймало strict=поймало',
    ].join(' | '))
  })
  it('исправление уже в ходе речи: interim→interim', () => {
    const v = makeView({ history: [{ t: 1000, text: "I'm try" }, { t: 2100, text: "I'm trying" }, { t: 2200, text: "I'm trying", final: true }], lastInterim: "I'm trying" })
    expect(attemptLine(entry(v))).toContain('final-vs-interim: try→trying (interim→interim)')
  })
  it('обратное исправление и «interim не было»', () => {
    expect(changesText({ changes: [{ kind: 'replace', from: 'trying', to: 'try', step: 'interim→final' }], histN: 1 })).toBe('trying→try (interim→final)')
    expect(changesText({ changes: [], histN: 0 })).toBe('interim не было')
    expect(changesText({ changes: [], histN: 3 })).toBe('нет изменений')
  })
  it('histMax=0 не показывает записи interim; записи без tx пропускаются', () => {
    expect(attemptLine(entry(), 0)).toContain('interim-история: 1 шт.')
    expect(attemptFields({})).toEqual([])
    expect(attemptsBlock([{ t: 1 }])[1]).toContain('пока нет')
  })
})

describe('«Скопировать все сравнения» ≤ 6000 символов', () => {
  const many = (n, hist = 12) => Array.from({ length: n }, (_, i) => entry(makeView({
    history: Array.from({ length: hist }, (__, k) => ({ t: k * 150, text: `I'm ${k % 2 ? 'try' : 'trying'} ${'x'.repeat(30)}${k}` })),
    alternatives: Array.from({ length: 10 }, (__, k) => a(`alt hypothesis number ${k} with some words`, 0.5)), final: a("I'm trying", 0.9),
  }), extra, { t: i + 1, run: n - i }))
  it('мало данных — всё как есть', () => {
    const t = allComparisonsText({ log: many(2, 2), seriesLines: ['СЕРИЯ x'], head: ['ВСЕ'] })
    expect(t.length).toBeLessThan(6000)
    expect(t).toContain('СЕРИЯ x')
    expect(t.match(/№\d/g)).toHaveLength(2)
  })
  it('много данных — прореживает interim и выкидывает старые, серия остаётся, длина ≤ лимита', () => {
    const series = Array.from({ length: 12 }, (_, i) => `серия строка ${i} ${'s'.repeat(100)}`)
    const t = allComparisonsText({ log: many(10), seriesLines: series, head: ['ВСЕ'] })
    expect(t.length).toBeLessThanOrEqual(6000)
    expect(t).toContain('серия строка 11')
    expect(t).toMatch(/№10/) // самое новое осталось
  })
  it('пустой журнал не падает', () => {
    expect(allComparisonsText({ log: [], seriesLines: [] })).toContain('попыток с текстами нет')
  })
})
