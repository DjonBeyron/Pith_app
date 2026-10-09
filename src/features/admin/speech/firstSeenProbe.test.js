import { describe, it, expect } from 'vitest'
import { analyzeAttempt } from './antiPredictRules.js'
import { verdictRows, comparisonText, antiPredictLogFields } from './antiPredictReport.js'
import { sanitizeSettings, DEFAULT_SETTINGS } from './antiPredictModes.js'
import { rulesText } from './contextSeries.js'

// Правило «первое увиденное» внутри пробы «Голос» (п. 9): вердикт, строка таблицы, отчёты, параметр dwell
const REF = "I'm trying"
const WRONG = ["I'm try"]
const a = (text, confidence) => ({ text, confidence })
const h = (t, text, final) => ({ t, text, ...(final ? { final: true } : {}) })

const run = (history, extra = {}) => analyzeAttempt({ reference: REF, wrong: WRONG, final: a("I'm trying", 0.9), history, lastInterim: "I'm trying", ...extra })
const USER_LOG = [h(400, 'I'), h(700, 'I am'), h(950, "I'm am"), h(1200, "I'm"), h(1500, "I'm trying"), h(1900, "I'm trying", true)]
const HELD = [h(300, "I'm"), h(600, "I'm try"), { t: 1500, kind: 'speechend' }, h(1700, "I'm trying"), h(2000, "I'm trying", true)]
const FLASH = [h(300, "I'm"), h(600, "I'm try"), h(720, "I'm trying"), { t: 1400, kind: 'speechend' }, h(1600, "I'm trying", true)]

describe('analyzeAttempt: четвёртое правило «первое увиденное»', () => {
  it('история из журнала пользователя: подтверждает «trying», «все четыре» проходят', () => {
    const an = run(USER_LOG)
    expect(an.verdicts.first).toMatchObject({ ok: true, missed: [], used: true })
    expect(an.verdicts.all).toBe(true)
  })

  it('намеренное «I\'m try» (interim «try» 1,1 с до замены): НЕ подтверждает, хотя top-1 и (при полном interim) консенсус «чисты»', () => {
    const an = run(HELD)
    expect(an.verdicts.first.ok).toBe(false)
    expect(an.verdicts.first.missed).toEqual(['trying'])
    expect(an.verdicts.top1.ok).toBe(true)
    expect(an.verdicts.consensus.ok).toBe(true) // lastInterim = «I'm trying»
    expect(an.verdicts.all).toBe(false)
    expect(an.verdicts.first.details.text).toBe('i am try')
  })

  it('мимолётное «try» 120 мс: подтверждает; спорное слово с выдержкой есть в деталях', () => {
    const an = run(FLASH)
    expect(an.verdicts.first.ok).toBe(true)
    expect(an.verdicts.first.details.disputed).toMatchObject([{ word: 'trying', form: 'try', dwellMs: 120, atEnd: false, blocked: false }])
  })

  it('параметр dwell: порог 100 мс делает и мимолётное «try» спорным (по умолчанию 500; зажато 0–1200)', () => {
    expect(run(FLASH, { dwellMs: 100 }).verdicts.first.details.dwellMs).toBe(100)
    expect(run(FLASH, { dwellMs: 200 }).verdicts.first.ok).toBe(true) // 120 мс не дольше 200
    expect(run(FLASH, { dwellMs: 100 }).verdicts.first.ok).toBe(false) // а 100 мс — уже дольше
    expect(run(FLASH, { dwellMs: 0 }).verdicts.first.ok).toBe(false) // 0 = любое появление формы
    const quick = [h(300, "I'm try"), h(700, "I'm trying"), h(1200, "I'm trying", true)] // 400 мс
    expect(run(quick, { dwellMs: 500 }).verdicts.first.ok).toBe(true)
    expect(run(quick, { dwellMs: 300 }).verdicts.first.ok).toBe(false)
  })

  it('служебные события не попадают в таймлайн текстов, но возвращаются отдельно', () => {
    const an = run([{ t: 50, kind: 'soundstart' }, ...HELD])
    expect(an.timeline.every(x => typeof x.text === 'string')).toBe(true)
    expect(an.events.map(e => e.kind)).toEqual(['soundstart', 'speechend'])
  })
})

describe('таблица вердиктов и отчёты', () => {
  it('строка «первое увиденное (выдержка N мс)» с пояснением; «все четыре вместе»', () => {
    const rows = verdictRows(run(HELD), 'wrong')
    expect(rows.map(r => r.id)).toEqual(['top1', 'consensus', 'strict', 'first', 'all'])
    const first = rows.find(r => r.id === 'first')
    expect(first.name).toBe('первое увиденное (выдержка 500 мс)')
    expect(first.ok).toBe(false)
    expect(first.judge).toMatchObject({ good: true, label: 'поймало ошибку' })
    expect(first.note).toBe('trying: «try» держалась 1100 мс, на момент конца речи')
    expect(rows.find(r => r.id === 'all').name).toBe('все четыре вместе')
    expect(verdictRows(run(USER_LOG), 'ref').find(r => r.id === 'first').judge.label).toBe('верно принято')
  })

  it('«Скопировать сравнение»: строка «Первое увиденное» с восстановленным текстом, спорными словами и вердиктом', () => {
    const view = { reference: REF, extra: { modes: ['history'] }, final: a("I'm trying", 0.9), alternatives: [a("I'm trying", 0.9)], history: HELD, lastInterim: "I'm trying", applied: null }
    const txt = comparisonText({ view, said: "I'm try", analysis: run(HELD), caps: null })
    expect(txt).toContain('Первое увиденное: восстановлено «i am try»; спорные: trying←«try» 1100 мс на конце речи [не подтверждено]; выдержка 500 мс; вердикт: НЕ подтверждено (trying)')
    expect(txt).toContain('первое увиденное (выдержка 500 мс): НЕ подтверждено — поймало ошибку')
  })

  it('журнал: dwell из снимка настроек доходит до правила; tx.first и вердикт first сохраняются', () => {
    const view = { reference: REF, final: a("I'm trying", 0.9), alternatives: [], history: [h(300, "I'm try"), h(700, "I'm trying"), h(1200, "I'm trying", true)], lastInterim: "I'm trying", lang: 'en-US' }
    const loose = antiPredictLogFields({ view, extra: { modes: [], wrong: WRONG, settings: { dwell: 500 } } })
    const tight = antiPredictLogFields({ view, extra: { modes: [], wrong: WRONG, settings: { dwell: 300 } } })
    expect(loose.tx.verdicts.first).toBe(true)
    expect(tight.tx.verdicts.first).toBe(false)
    expect(tight.tx.first).toMatchObject({ dwell: 300, disputed: [['trying', 'try', 400, 1]] })
  })

  it('итог серии: правило first в строке правил; старые записи без first не ломаются', () => {
    expect(rulesText({ top1: true, consensus: true, strict: true, first: false })).toBe('top1=пропустило consensus=пропустило strict=пропустило first=поймало')
    expect(rulesText({ top1: true, consensus: true, strict: true })).toBe('top1=пропустило consensus=пропустило strict=пропустило')
  })
})

describe('настройка dwell', () => {
  it('по умолчанию 500, зажимается 0–1200, мусор → 500', () => {
    expect(DEFAULT_SETTINGS.dwell).toBe(500)
    expect(sanitizeSettings({ dwell: 900 }).dwell).toBe(900)
    expect(sanitizeSettings({ dwell: 20 }).dwell).toBe(20)
    expect(sanitizeSettings({ dwell: -40 }).dwell).toBe(0)
    expect(sanitizeSettings({ dwell: 99999 }).dwell).toBe(1200)
    expect(sanitizeSettings({ dwell: 'abc' }).dwell).toBe(500)
    expect(sanitizeSettings(null).dwell).toBe(500)
  })
})
