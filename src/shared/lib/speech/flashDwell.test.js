import { describe, it, expect } from 'vitest'
import {
  DWELL_DEFAULT, DWELL_MIN, DWELL_MAX, THRESHOLDS, clampDwell, snapshotsOf, formStats, isBlocked, catchesAt, flashSummary, flashText, packForm, unpackForms,
} from './flashDwell.js'

const h = (t, text, final) => ({ t, text, ...(final ? { final: true } : {}) })
// Движок сначала показал «I'm try» (280 мс), потом ОРФОГРАФИЧЕСКИ переписал на «I'm trying»
const HIST = [h(300, "I'm"), h(600, "I'm try"), h(880, "I'm trying"), h(1700, "I'm trying", true)]
const snaps = snapshotsOf({ history: HIST, final: { text: "I'm trying" }, lastInterim: "I'm trying" })

describe('порог: 0–1200 мс, 0 = любое появление', () => {
  it('границы и мусор', () => {
    expect([DWELL_MIN, DWELL_MAX, DWELL_DEFAULT]).toEqual([0, 1200, 500])
    expect(clampDwell(0)).toBe(0)
    expect(clampDwell(-10)).toBe(0)
    expect(clampDwell(99999)).toBe(1200)
    expect(clampDwell('300')).toBe(300)
    for (const bad of [null, undefined, '', 'abc', NaN]) expect(clampDwell(bad)).toBe(500)
    expect(THRESHOLDS).toEqual([0, 100, 200, 300, 500])
  })
})

describe('formStats: сколько мс форма стояла подряд', () => {
  it('«try» 280 мс в interim: первое появление 600, не на конце речи и не в итоге', () => {
    expect(formStats(snaps, 'try')).toEqual({ any: true, interim: true, firstAt: 600, dwellMs: 280, atEnd: false, inFinal: false })
  })
  it('формы нет в истории → any:false', () => {
    expect(formStats(snaps, 'tried')).toMatchObject({ any: false, interim: false, firstAt: null })
  })
  it('форма только в итоге: inFinal, в interim не мелькала', () => {
    const s = snapshotsOf({ history: [h(500, "I'm"), h(900, "I'm try", true)], final: { text: "I'm try" } })
    expect(formStats(s, 'try')).toMatchObject({ interim: false, inFinal: true })
  })
  it('время неизвестно (одиночный lastInterim без истории) → dwellMs null', () => {
    expect(formStats(snapshotsOf({ lastInterim: "I'm try", final: { text: "I'm trying" } }), 'try').dwellMs).toBeNull()
  })
})

describe('isBlocked / catchesAt: поймана ли форма при пороге', () => {
  const f = { dwellMs: 280, atEnd: false, inFinal: false }
  it('дольше порога — поймана; не дольше — нет; 0 — любое появление', () => {
    expect([0, 100, 200].map(d => isBlocked(f, d))).toEqual([true, true, true])
    expect([280, 300, 500].map(d => isBlocked(f, d))).toEqual([false, false, false])
  })
  it('в итоге, на конце речи, время неизвестно — поймана при любом пороге', () => {
    for (const x of [{ dwellMs: 10, inFinal: true }, { dwellMs: 10, atEnd: true }, { dwellMs: null }]) expect(isBlocked(x, 1200)).toBe(true)
  })
  it('catchesAt: хоть одна форма; нет форм — нет', () => {
    expect(catchesAt([f], 200)).toBe(true)
    expect(catchesAt([f], 300)).toBe(false)
    expect(catchesAt([], 0)).toBe(false)
    expect(catchesAt(undefined, 0)).toBe(false)
  })
})

describe('тексты и компактная запись', () => {
  const forms = [{ word: 'trying', form: 'try', firstAt: 600, dwellMs: 280, atEnd: false, inFinal: false, interim: true }]
  it('«мелькала «try» 280 мс» / «не мелькала» / «стоит в итоге» / время неизвестно', () => {
    expect(flashText(forms)).toBe('мелькала «try» 280 мс')
    expect(flashText([])).toBe('не мелькала')
    expect(flashText([{ ...forms[0], interim: false, inFinal: true }])).toBe('стоит в итоге «try»')
    expect(flashText([{ ...forms[0], dwellMs: null }])).toContain('время неизвестно')
  })
  it('сводка: самая долгая форма', () => {
    const two = [...forms, { ...forms[0], form: 'tried', dwellMs: 700 }]
    expect(flashSummary(two)).toMatchObject({ shown: true, maxMs: 700, form: 'tried' })
    expect(flashSummary([])).toMatchObject({ shown: false, maxMs: null })
  })
  it('pack → unpack возвращает то же', () => {
    expect(unpackForms(forms.map(packForm))).toEqual(forms)
    expect(unpackForms(null)).toEqual([])
  })
})
