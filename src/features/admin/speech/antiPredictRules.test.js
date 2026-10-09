import { describe, it, expect } from 'vitest'
import { wrongTokenMap, keysOf, classify, analyzeAttempt, saidKind, judge, classifyPhrase } from './antiPredictRules.js'
import { verdictRows, comparisonText, antiPredictLogFields, fmtAntiPredict } from './antiPredictReport.js'

const REF = "I'm trying"
const WRONG = ["I'm try", "I'm tried", "I'm tries"]
const a = (text, confidence) => ({ text, confidence })

// Фикстура из задачи: сказали «I'm try», итог «I am trying», interim «I am try», среди гипотез есть «I am try»
const caught = () => ({
  reference: REF, wrong: WRONG,
  final: a('I am trying', 0.92),
  alternatives: [a('I am trying', 0.92), a('I am try', 0.05), a("I'm trying", 0.02)],
  history: [{ t: 420, text: 'I am' }, { t: 800, text: 'I am try' }, { t: 1450, text: 'I am trying', final: true }],
  lastInterim: 'I am try',
})

describe('карта ошибочных токенов', () => {
  it("«I'm trying» + ошибочные фразы той же длины → trying: try/tried/tries", () => {
    const m = wrongTokenMap(REF, WRONG)
    expect([...m.keys()]).toEqual(['trying'])
    expect([...m.get('trying')]).toEqual(['try', 'tried', 'tries'])
    expect(keysOf(REF, m)).toEqual(['trying'])
  })
  it('фраза другой длины: чужое слово привязывается к ближайшему слову эталона', () => {
    const m = wrongTokenMap('I am trying', ['I tryed'])
    expect([...m.get('trying')]).toEqual(['tryed'])
  })
  it('нет ошибочных форм → ключевые все слова эталона', () => {
    expect(keysOf('go home', wrongTokenMap('go home', []))).toEqual(['go', 'home'])
  })
  it('classify: ref / wrong / none', () => {
    const m = wrongTokenMap(REF, WRONG)
    expect(classify('I am try', m, ['trying'])).toEqual({ state: { trying: 'wrong' }, literal: ['try'] })
    expect(classify('I am trying', m, ['trying']).state.trying).toBe('ref')
    expect(classify('I am', m, ['trying']).state.trying).toBe('none')
  })
})

describe('analyzeAttempt: движок «исправил» try → trying', () => {
  const an = analyzeAttempt(caught())

  it('top-1 final пропускает ошибку, консенсус и N-best — нет', () => {
    expect(an.verdicts.top1).toMatchObject({ ok: true, missed: [] })
    expect(an.verdicts.consensus).toMatchObject({ ok: false, used: true, missed: ['trying'], fixed: ['trying'] })
    expect(an.verdicts.strict.ok).toBe(false) // консенсус не прошёл
    expect(an.verdicts.all).toBe(false)
  })
  it('N-best: альтернатива «try» есть, но с меньшей уверенностью — не блокирует, но подозрительна', () => {
    expect(an.verdicts.strict).toMatchObject({ used: true, suspect: true, blockers: [] })
    expect(an.nbest.map(x => x.literal)).toEqual([[], ['try'], []])
  })
  it('таймлайн: «try» в interim на 800 мс, «trying» только в итоге (1450 мс)', () => {
    expect(an.flip).toEqual({ key: 'trying', wrong: 'try', fromT: 800, toT: 1450, toFinal: true, from: 'I am try', to: 'I am trying' })
    expect(an.engineFixed).toBe(true)
    expect(an.fixedAt).toEqual({ t: 1450, final: true })
  })
  it('литеральная форма встретилась: в N-best №2 и в interim 800 мс', () => {
    expect(an.literalSeen).toBe(true)
    expect(an.where).toEqual(['N-best №2 «I am try»', 'interim 800 мс «I am try»'])
  })
  it('оценка по подписи «что я сказал»: try', () => {
    const kind = saidKind('try', an)
    expect(kind).toBe('wrong')
    const rows = verdictRows(an, kind)
    expect(rows.find(r => r.id === 'top1').judge).toEqual({ good: false, label: 'пропустило ошибку' })
    expect(rows.find(r => r.id === 'consensus').judge).toEqual({ good: true, label: 'поймало ошибку' })
    expect(rows.find(r => r.id === 'strict').judge.good).toBe(true)
    expect(saidKind('trying', an)).toBe('ref')
    expect(saidKind('', an)).toBeNull()
    expect(saidKind('hello', an)).toBeNull()
  })
})

describe('N-best строго', () => {
  it('ошибочная форма с равной уверенностью блокирует, даже если консенсус прошёл', () => {
    const an = analyzeAttempt({
      reference: REF, wrong: WRONG, final: a('I am trying', 0.8),
      alternatives: [a('I am trying', 0.8), a('I am try', 0.8)],
      history: [{ t: 500, text: 'I am trying' }, { t: 900, text: 'I am trying', final: true }], lastInterim: 'I am trying',
    })
    expect(an.verdicts.top1.ok).toBe(true)
    expect(an.verdicts.consensus.ok).toBe(true)
    expect(an.verdicts.strict.blockers.map(b => b.no)).toEqual([2])
    expect(an.verdicts.strict.ok).toBe(false)
    expect(an.verdicts.all).toBe(false)
    expect(an.engineFixed).toBe(false)
    expect(an.literalSeen).toBe(true)
  })
  it('без данных уверенности ошибочная альтернатива блокирует (осторожно)', () => {
    const an = analyzeAttempt({
      reference: REF, wrong: WRONG, final: a('I am trying', null), alternatives: [a('I am trying', null), a('I am try', null)],
      history: [], lastInterim: '',
    })
    expect(an.verdicts.strict.ok).toBe(false)
  })
  it('альтернативы не запрашивались — правило сообщает used: false и повторяет консенсус', () => {
    const an = analyzeAttempt({ reference: REF, wrong: WRONG, final: a('I am trying', 0.9), alternatives: [a('I am trying', 0.9)], history: [], lastInterim: 'I am trying' })
    expect(an.verdicts.strict).toMatchObject({ used: false, ok: true })
  })
})

describe('analyzeAttempt: остальные случаи', () => {
  it('верная речь: все правила принимают, движок не исправлял, литералей нет', () => {
    const an = analyzeAttempt({
      reference: REF, wrong: WRONG, final: a('I am trying', 0.95), alternatives: [a('I am trying', 0.95), a('I am trained', 0.1)],
      history: [{ t: 300, text: 'I am' }, { t: 700, text: 'I am trying' }, { t: 1100, text: 'I am trying', final: true }], lastInterim: 'I am trying',
    })
    expect(an.verdicts).toMatchObject({ all: true })
    expect(an.engineFixed).toBe(false)
    expect(an.literalSeen).toBe(false)
    expect(an.flip).toBeNull()
    expect(saidKind('trying', an)).toBe('ref')
    expect(judge('ref', an.verdicts.all)).toEqual({ good: true, label: 'верно принято' })
    expect(judge('ref', false)).toEqual({ good: false, label: 'ложно отклонило' })
    expect(judge(null, true)).toBeNull()
  })
  it('engine дописал слово только в итоге (interim короче) — консенсус не используется, решает final', () => {
    const an = analyzeAttempt({ reference: REF, wrong: WRONG, final: a('I am trying', 0.9), alternatives: [], history: [], lastInterim: 'I' })
    expect(an.verdicts.consensus.used).toBe(false)
    expect(an.verdicts.consensus.ok).toBe(true)
  })
  it('итог — ошибочная форма: все правила отклоняют, литерально в итоге', () => {
    const an = analyzeAttempt({ reference: REF, wrong: WRONG, final: a('I am try', 0.9), alternatives: [a('I am try', 0.9)], history: [{ t: 700, text: 'I am try', final: true }], lastInterim: '' })
    expect(an.verdicts.top1.ok).toBe(false)
    expect(an.verdicts.all).toBe(false)
    expect(an.where).toEqual(['итог (№1) «I am try»'])
  })
  it('одно слово без контекста: эталон «trying», сказали «try» → вердикт «не подтверждено»', () => {
    const an = analyzeAttempt({ reference: 'trying', wrong: ['try', 'tried', 'tries'], final: a('try', 0.88), alternatives: [a('try', 0.88)], history: [], lastInterim: '' })
    expect(an.keys).toEqual(['trying'])
    expect(an.verdicts.top1.ok).toBe(false)
  })
  it('нет итога → null', () => {
    expect(analyzeAttempt({ reference: REF, wrong: WRONG, final: null })).toBeNull()
    expect(analyzeAttempt({ reference: REF, wrong: WRONG, final: { text: '' } })).toBeNull()
  })
})

describe('classifyPhrase (Vosk)', () => {
  it('ref / wrong / other / empty', () => {
    expect(classifyPhrase('i am trying', REF, WRONG)).toBe('ref')
    expect(classifyPhrase('i am try', "I'm trying", ['i am try'])).toBe('wrong')
    expect(classifyPhrase("I'm try", REF, WRONG)).toBe('wrong')
    expect(classifyPhrase('[unk]', REF, WRONG)).toBe('other')
    expect(classifyPhrase('', REF, WRONG)).toBe('empty')
  })
})

describe('отчёты', () => {
  const view = () => ({
    runNo: 3, reference: REF, lang: 'en-US', final: a('I am trying', 0.92), alternatives: caught().alternatives, history: caught().history,
    lastInterim: 'I am try', usedInterim: false, error: null, segments: [],
    extra: { modes: ['alts', 'history'], oneWord: false, wrong: WRONG },
    applied: { lang: 'en-US', maxAlternatives: 10, continuous: false, processLocally: null, phrases: null, grammars: null, skipped: [] },
  })
  it('поля журнала: режимы, число альтернатив, engineFixed, literalSeen', () => {
    const v = view()
    expect(antiPredictLogFields({ view: v, extra: v.extra })).toEqual({ antipredict: ['alts', 'history'], nAlts: 3, engineFixed: true, literalSeen: true })
    expect(antiPredictLogFields({})).toEqual({ antipredict: [], nAlts: 0, engineFixed: null, literalSeen: null })
  })
  it('колонка журнала: старые записи → «—»', () => {
    expect(fmtAntiPredict({})).toBe('—')
    expect(fmtAntiPredict({ antipredict: [], nAlts: 3, engineFixed: false, literalSeen: false })).toBe('обычный · 3 альт. · исправил: нет · литерально: нет')
    expect(fmtAntiPredict({ antipredict: ['alts', 'words'], nAlts: 10, engineFixed: true, literalSeen: true })).toContain('alts+words')
  })
  it('«Скопировать сравнение» содержит эталон, что говорилось, режимы, гипотезы, таймлайн и вердикты', () => {
    const v = view()
    const text = comparisonText({ view: v, said: 'try', analysis: analyzeAttempt({ ...caught() }), caps: { uaShort: 'Android 14, Chrome' } })
    expect(text).toContain("Эталон: «I'm trying»")
    expect(text).toContain('Что говорилось: «try»')
    expect(text).toContain('Режимы: alts, history')
    expect(text).toContain('maxAlternatives 10')
    expect(text).toContain('2. «I am try» 5% [литерально: try]')
    expect(text).toContain('800 «I am try» → 1450 «I am trying» [final]')
    expect(text).toContain('Слово изменено движком: да — «try» → «trying» между 800 и 1450 мс (в final)')
    expect(text).toContain('top-1 final: подтверждено — пропустило ошибку')
    expect(text).toContain('консенсус interim+final: НЕ подтверждено — поймало ошибку')
    expect(text).toContain('Устройство: Android 14, Chrome')
  })
  it('без итога сравнение сообщает причину', () => {
    const v = { ...view(), final: null, error: 'no-speech' }
    expect(comparisonText({ view: v, said: '', analysis: null })).toContain('Итога нет (no-speech)')
  })
})
