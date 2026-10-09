import { describe, it, expect } from 'vitest'
import { analyzeAttempt, focusOf } from './antiPredictRules.js'
import { antiPredictLogFields, comparisonText } from './antiPredictReport.js'
import { attemptFields } from './speechReportAttempts.js'
import { flashVerdict, detailLines } from './seriesCards.js'
import { buildRow } from './contextSeries.js'

// Баг: «литерально: нет» при «interim исправлен». Ошибочная форма считается встретившейся, если она стояла в ЛЮБОМ элементе истории interim
// (в том числе заменённом позже) или была словом «было» в замене движка — с моментом первого появления и длительностью показа.
const a = (text, confidence) => ({ text, confidence })
const h = (t, text, final) => ({ t, text, ...(final ? { final: true } : {}) })
const REF = "I'm trying"
// «I'm try» стояло 280 мс (600→880), затем движок орфографически переписал на «I'm trying»
const FLASH = [h(300, "I'm"), h(600, "I'm try"), h(880, "I'm trying"), { t: 1500, kind: 'speechend' }, h(1700, "I'm trying", true)]
// Контроль: сказано правильно — «try» посреди слова не мелькало
const CLEAN = [h(400, 'I'), h(700, 'I am'), h(950, "I'm am"), h(1200, "I'm"), h(1500, "I'm trying"), h(1900, "I'm trying", true)]

const an = (history, over = {}) => analyzeAttempt({ reference: REF, wrong: ["I'm try"], final: a("I'm trying", 0.71), alternatives: [a("I'm trying", 0.71)], history, lastInterim: "I'm trying", ...over })

describe('literalSeen: форма из любого interim, в том числе заменённого позже', () => {
  it('«I\'m try» 280 мс → literalSeen, место interim@600, длительность 280', () => {
    const r = an(FLASH)
    expect(r.literalSeen).toBe(true)
    expect(r.places).toContainEqual({ at: 'interim', t: 600, word: 'try' })
    expect(r.flash.forms).toEqual([{ word: 'trying', form: 'try', firstAt: 600, dwellMs: 280, atEnd: false, inFinal: false, interim: true }])
    expect(r.flash).toMatchObject({ shown: true, maxMs: 280, form: 'try' })
    expect(r.engineFixed).toBe(true)
  })
  it('в журнале: literal=interim@0.6s, flash — [слово, форма, 280, 600, …]', () => {
    const view = { reference: REF, lang: 'en-US', final: a("I'm trying", 0.71), alternatives: [a("I'm trying", 0.71)], history: FLASH, lastInterim: "I'm trying" }
    const f = antiPredictLogFields({ view, extra: { modes: ['history'], wrong: ["I'm try"], said: "I'm try" } })
    expect(f.literalSeen).toBe(true)
    expect(f.tx.literal).toEqual(['interim@0.6s'])
    expect(f.tx.flash).toEqual([['trying', 'try', 280, 600, 0, 0, 1]])
    expect(attemptFields({ tx: f.tx }).find(x => x[0] === 'flash')[2]).toBe('ошибочная форма мелькала «try» 280 мс')
  })
  it('форма, которой НЕТ в списке ошибок (движок мелькнул другой формой семьи), всё равно найдена', () => {
    const r = an(FLASH, { wrong: ["I'm tried"] }) // список ошибок знает только «tried»
    expect(r.literalSeen).toBe(true)
    expect(r.places.some(p => p.at === 'interim' && p.word === 'try')).toBe(true)
    expect(r.where.join(' ')).toContain('«try» стояла в interim с 600 мс (280 мс)')
    expect(an(FLASH, { wrong: [] }).flash.forms[0]).toMatchObject({ form: 'try', dwellMs: 280 })
  })
  it('замена движка changes[].from → слово эталона тоже считается встречей формы', () => {
    const hist = [h(300, "I'm tryin"), h(700, "I'm trying"), h(1200, "I'm trying", true)]
    const r = an(hist, { wrong: ["I'm try"] })
    expect(r.diff.fixed[0]).toMatchObject({ from: 'tryin', to: 'trying', dir: 'toRef' })
    expect(r.flash.forms.map(f => f.form)).toContain('tryin')
    expect(r.literalSeen).toBe(true)
  })
  it('контроль (правильная речь, «try» не мелькало): формы нет', () => {
    const r = an(CLEAN)
    expect(r.flash.forms).toEqual([])
    expect(r.literalSeen).toBe(false)
    expect(flashVerdict({ mode: 'control', kind: 'ref', flash: { forms: [], d: 500 } }).text).toContain('не мелькала')
  })
  it('focus: чужое слово эталона («play» → «please») не считается мельканием ключевого слова', () => {
    const hist = [h(300, "I'm trying to play"), h(700, "I'm trying to please"), h(1200, "I'm trying to please", true)]
    const ref = "I'm trying to please"
    const all = analyzeAttempt({ reference: ref, wrong: [], final: a(ref, 0.9), history: hist, lastInterim: ref })
    const only = analyzeAttempt({ reference: ref, wrong: [], final: a(ref, 0.9), history: hist, lastInterim: ref, focus: focusOf({ series: { word: 'trying' } }) })
    expect(all.engineFixed).toBe(true) // play→please «исправление» — но это другое слово, не trying
    expect(all.flash.forms.map(f => f.form)).toContain('play')
    expect(only.flash.forms).toEqual([])
    expect(only.engineFixed).toBe(false) // «исправил» в серии — только про ключевое слово, замена play→please в счёт не идёт
    expect(only.fixed).toEqual([])
    expect(focusOf({})).toBeNull()
  })
})

describe('замена всего короткого текста не считается исправлением слова', () => {
  it('«I» → «trying» (контроль, одно слово): не исправление и не мелькание ошибочной формы', () => {
    const r = analyzeAttempt({ reference: 'trying', wrong: ['try'], final: a('trying', 0.9), history: [h(400, 'I'), h(800, 'trying'), h(1800, 'trying', true)], lastInterim: 'trying', focus: ['trying'] })
    expect(r.engineFixed).toBe(false)
    expect(r.flash.forms).toEqual([])
    expect(r.literalSeen).toBe(false)
  })
})

describe('порог: 280 мс ловится при 0–200, не ловится при 300–500', () => {
  it('вердикт «первое увиденное» по настройке', () => {
    expect([0, 100, 200, 300, 500].map(d => an(FLASH, { dwellMs: d }).verdicts.first.ok)).toEqual([false, false, false, true, true])
  })
  it('на конце речи форма ловится при любом пороге', () => {
    const hist = [h(300, "I'm try"), { t: 450, kind: 'speechend' }, h(580, "I'm trying"), h(900, "I'm trying", true)]
    expect(an(hist, { dwellMs: 1200 }).verdicts.first.ok).toBe(false)
  })
})

describe('карточка шага и отчёты', () => {
  const rowOf = (history, mode, dwell = 500) => {
    const view = { reference: REF, lang: 'en-US', final: a("I'm trying", 0.71), alternatives: [a("I'm trying", 0.71)], history, lastInterim: "I'm trying" }
    const f = antiPredictLogFields({ view, extra: { modes: [], wrong: ["I'm try"], said: mode === 'control' ? REF : "I'm try", settings: { dwell }, series: { step: 1, word: 'trying', wrongPhrase: "I'm try", ...(mode === 'control' ? { mode } : {}) } } })
    return buildRow({ t: 5, tx: f.tx })
  }
  it('режим «с ошибкой», порог 500: исправил, ошибка мелькнула 280 мс — правило пропустило (короче порога)', () => {
    const row = rowOf(FLASH, 'errors', 500)
    expect(row).toMatchObject({ mode: 'errors', kind: 'ref', flash: { d: 500 } })
    expect(flashVerdict(row)).toEqual({ tone: 'fixed', text: '⚠ Движок исправил, но ошибка мелькала (280 мс) — правило пропустило (мелькала короче порога 500 мс)' })
  })
  it('порог 150: то же мелькание — правило поймало', () => {
    expect(flashVerdict(rowOf(FLASH, 'errors', 150))).toEqual({ tone: 'ok', text: '⚠ Движок исправил, но ошибка МЕЛЬКНУЛА (280 мс) — правило её поймало' })
  })
  it('исправил, а мелькания не было — поймать нечем', () => {
    expect(flashVerdict(rowOf(CLEAN, 'errors')).text).toBe('⚠ Движок исправил, и ошибка НЕ мелькала — поймать её нечем')
  })
  it('контроль: мелькнула — ложная тревога при низком пороге; короче порога — нет', () => {
    const c = rowOf(FLASH, 'control', 100)
    expect(c.mode).toBe('control')
    expect(c.said).toBe(REF)
    expect(flashVerdict(c).text).toContain('ЛОЖНУЮ тревогу')
    expect(flashVerdict(rowOf(FLASH, 'control', 500)).text).toBe('✅ Контроль: форма мелькнула (280 мс), но короче порога 500 мс — ложной тревоги нет')
    expect(flashVerdict(rowOf(CLEAN, 'control')).text).toBe('✅ Контроль: ошибка не мелькала — ложной тревоги нет')
  })
  it('старая запись без flash — null; «Подробнее» показывает мелькание', () => {
    expect(flashVerdict({ kind: 'ref', flash: null })).toBeNull()
    expect(detailLines(rowOf(FLASH, 'errors'), 'r').join('\n')).toContain('Ошибочная форма: мелькала «try» 280 мс (порог 500 мс)')
  })
  it('«Скопировать сравнение»: строка про ошибочную форму', () => {
    const view = { reference: REF, extra: { modes: ['history'] }, final: a("I'm trying", 0.9), alternatives: [a("I'm trying", 0.9)], history: FLASH, lastInterim: "I'm trying", applied: null }
    expect(comparisonText({ view, said: "I'm try", analysis: an(FLASH), caps: null })).toContain('Ошибочная форма: мелькала «try» 280 мс')
  })
})
