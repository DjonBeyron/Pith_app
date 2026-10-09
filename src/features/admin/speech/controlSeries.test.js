import { describe, it, expect } from 'vitest'
import {
  emptyState, recordEntry, rowsOf, clearLang, sanitizeState, readState, writeState, SERIES_KEY, DEFAULT_REFS, MAX_RUNS,
} from './contextSeries.js'
import {
  MODES, MODE_LABEL, phraseFor, thresholdTable, recommend, langsWithData, seriesFullLines, seriesText, SERIES_TEXT_MAX,
} from './controlSeries.js'
import { antiPredictLogFields } from './antiPredictReport.js'

const a = (text, confidence) => ({ text, confidence })
const h = (t, text, final) => ({ t, text, ...(final ? { final: true } : {}) })
const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) } }

// Истории interim: «try» стояло N мс (движок затем переписал на «trying») или вообще не мелькало
const blip = ms => [h(300, 'I am'), h(600, 'I am try'), h(600 + ms, 'I am trying'), h(1700, 'I am trying', true)]
const clean = () => [h(400, 'I'), h(700, 'I am'), h(1000, 'I am trying'), h(1900, 'I am trying', true)]

// Запись журнала шага серии: mode — 'errors' | 'control'; ms — сколько мс мелькало «try» (null — не мелькало)
function entryOf(step, mode, ms, { lang = 'en-US', top1 = "I'm trying", conf = 0.9 } = {}) {
  const ref = DEFAULT_REFS[step]
  const history = ms == null ? clean() : blip(ms)
  const view = { reference: ref, lang, final: a(top1, conf), alternatives: [a(top1, conf)], history, lastInterim: top1 }
  const wrongPhrase = ref.replace('trying', 'try')
  const f = antiPredictLogFields({ view, extra: { modes: [], wrong: [wrongPhrase], said: mode === 'control' ? ref : wrongPhrase, settings: { dwell: 500 }, series: { step, word: 'trying', wrongPhrase, ...(mode === 'control' ? { mode } : {}) } } })
  return { t: 1000 + step, tx: f.tx }
}
const feed = (specs, st = emptyState()) => specs.reduce((s, sp) => recordEntry(s, entryOf(...sp)), st)

describe('режимы и хранение: ошибки и контроль отдельно, по языку', () => {
  it('подписи режимов; что говорить на шаге', () => {
    expect(MODES).toEqual(['errors', 'control'])
    expect(MODE_LABEL).toEqual({ errors: 'говорю С ОШИБКОЙ', control: 'говорю ПРАВИЛЬНО (контроль)' })
    const cfg = { word: 'trying', wrong: 'try', refs: DEFAULT_REFS }
    expect(phraseFor(cfg, 1, 'errors')).toBe("I'm try")
    expect(phraseFor(cfg, 1, 'control')).toBe("I'm trying")
    expect(phraseFor({ ...cfg, word: 'going' }, 1, 'errors')).toBeNull()
  })
  it('результат попадает в свой набор: errors → langs, control → control; язык отдельно', () => {
    const s = feed([[1, 'errors', 280], [1, 'control', null], [1, 'control', null, { lang: 'en-GB' }]])
    expect(rowsOf(s, 'en-US', 'errors')).toHaveLength(1)
    expect(rowsOf(s, 'en-US', 'control')).toHaveLength(1)
    expect(rowsOf(s, 'en-US', 'control')[0]).toMatchObject({ mode: 'control', said: "I'm trying" })
    expect(rowsOf(s, 'en-GB', 'errors')).toHaveLength(0)
    expect(rowsOf(s, 'en-GB', 'control')).toHaveLength(1)
    expect(s.runs.map(r => [r.mode, r.lang])).toEqual([['errors', 'en-US'], ['control', 'en-US'], ['control', 'en-GB']])
  })
  it('повтор шага заменяет карточку, но прогон копится для таблицы порогов', () => {
    const s = feed([[1, 'errors', 280], [1, 'errors', 100]])
    expect(rowsOf(s, 'en-US')).toHaveLength(1)
    expect(s.runs).toHaveLength(2)
  })
  it('очистка языка убирает оба режима и прогоны языка', () => {
    const s = clearLang(feed([[0, 'errors', 280], [0, 'control', null], [0, 'errors', 280, { lang: 'en-GB' }]]), 'en-US')
    expect(langsWithData(s)).toEqual(['en-GB'])
    expect(s.runs.map(r => r.lang)).toEqual(['en-GB'])
  })
  it('круг записи/чтения; старое состояние без control/runs/mode читается; мусор отбрасывается; runs ограничены', () => {
    const st = feed([[1, 'errors', 280], [2, 'control', null]])
    const store = mem()
    writeState(st, store)
    expect(readState(store)).toEqual(st)
    const old = sanitizeState({ cfg: { word: 'trying' }, langs: { 'en-US': { 1: { n: 2, top1: 'x' } } } })
    expect(old).toMatchObject({ control: {}, runs: [], mode: 'errors' })
    expect(rowsOf(old, 'en-US')).toHaveLength(1)
    expect(sanitizeState({ mode: 'control' }).mode).toBe('control')
    expect(sanitizeState({ runs: [null, { mode: 'x', lang: 'a', forms: [] }, { mode: 'control', lang: 'en-US', step: 2, forms: [[1], 5] }] }).runs).toEqual([{ mode: 'control', lang: 'en-US', step: 2, t: 0, forms: [[1]] }])
    expect(sanitizeState({ runs: Array.from({ length: 500 }, () => ({ mode: 'errors', lang: 'en-US', forms: [] })) }).runs).toHaveLength(MAX_RUNS)
    expect(readState(mem())).toEqual(emptyState())
    expect(SERIES_KEY).toBe('pithy_admin_voice_series_v1')
  })
})

describe('таблица порогов: поймали ошибок / ложных тревог', () => {
  // С ошибкой: «try» мелькало 280 мс в трёх прогонах, в одном не мелькало. Контроль: два чистых и два с мимолётным «try» 120 мс
  const state = feed([[0, 'errors', 280], [1, 'errors', 280], [2, 'errors', 280], [3, 'errors', null], [0, 'control', null], [1, 'control', null], [2, 'control', 120], [3, 'control', 120]])
  it('для каждого порога считает X из N и Y из M', () => {
    const t = thresholdTable(state, 'en-US')
    expect([t.nErr, t.nCtl]).toEqual([4, 4])
    expect(t.rows.map(r => [r.d, r.caught, r.falseAlarms])).toEqual([[0, 3, 2], [100, 3, 2], [200, 3, 0], [300, 0, 0], [500, 0, 0]])
  })
  it('рекомендация: максимум пойманных при нуле ложных тревог (200 мс)', () => {
    expect(recommend(thresholdTable(state, 'en-US')).text).toBe('рекомендуемый порог: 200 мс — ловит 3 из 4 ошибок, ложных тревог нет (0 из 4)')
    expect(recommend(thresholdTable(state, 'en-US')).d).toBe(200)
  })
  it('ложные тревоги неизбежны: контрольный прогон мелькал 700 мс → честно говорим об этом', () => {
    const s = feed([[1, 'control', 700]], feed([[0, 'errors', 280], [1, 'errors', 280], [0, 'control', null]]))
    const r = recommend(thresholdTable(s, 'en-US'))
    expect(r.text).toContain('ложные тревоги неизбежны')
    expect(r.text).toContain('Лучший компромисс — 200 мс: ловит 2 из 2 ошибок, но 1 из 2 правильных')
  })
  it('ловит больше при нуле ложных: при равенстве берётся больший порог', () => {
    const s = feed([[0, 'errors', 600], [1, 'errors', 600], [0, 'control', null]])
    expect(recommend(thresholdTable(s)).d).toBe(500)
  })
  it('ни один порог не ловит ошибку (она не мелькает) → так и пишем', () => {
    const s = feed([[0, 'errors', null], [0, 'control', null]])
    expect(recommend(thresholdTable(s)).text).toContain('ни при одном пороге ошибка не поймана (0 из 1)')
  })
  it('нет одного из режимов — просим оба', () => {
    expect(recommend(thresholdTable(feed([[0, 'errors', 280]]))).text).toContain('нужны оба режима (прогонов с ошибкой: 1, контрольных: 0)')
    expect(recommend(thresholdTable(emptyState())).d).toBeNull()
  })
  it('язык считается отдельно; без языка — все прогоны', () => {
    const s = feed([[0, 'errors', 280], [0, 'errors', 280, { lang: 'en-GB' }]])
    expect(thresholdTable(s, 'en-GB').nErr).toBe(1)
    expect(thresholdTable(s).nErr).toBe(2)
  })
  it('ошибка стоит в итоге (top-1 буквально) — поймана при любом пороге', () => {
    const view = { reference: "I'm trying", lang: 'en-US', final: a("I'm try", 0.5), alternatives: [a("I'm try", 0.5)], history: [h(500, "I'm try"), h(1200, "I'm try", true)], lastInterim: "I'm try" }
    const f = antiPredictLogFields({ view, extra: { modes: [], wrong: ["I'm try"], said: "I'm try", series: { step: 1, word: 'trying', wrongPhrase: "I'm try" } } })
    const t = thresholdTable(recordEntry(emptyState(), { t: 1, tx: f.tx }))
    expect(t.rows.map(r => r.caught)).toEqual([1, 1, 1, 1, 1])
  })
})

describe('«Скопировать итог серии»: оба режима, таблица порогов, «Услышали» и «мелькала»', () => {
  const state = feed([[0, 'errors', 280], [1, 'errors', 280], [2, 'errors', 280], [3, 'errors', null], [0, 'control', null], [1, 'control', null], [2, 'control', 120], [3, 'control', 120]])
  const text = seriesText(state, ['en-US'])
  it('таблица порогов и совет идут в начале', () => {
    expect(text).toContain('ПОРОГИ en-US: прогонов с ошибкой 4, контрольных 4')
    expect(text).toContain('порог 200 мс: поймали 3/4 · ложных тревог 0/4')
    expect(text).toContain('рекомендуемый порог: 200 мс')
    expect(text.indexOf('ПОРОГИ')).toBeLessThan(text.indexOf('РЕЖИМ «С ОШИБКОЙ»'))
  })
  it('оба режима; у каждого шага «Услышали» и «ошибочная форма мелькала … мс»', () => {
    expect(text).toContain('РЕЖИМ «С ОШИБКОЙ»')
    expect(text).toContain('РЕЖИМ «КОНТРОЛЬ»')
    expect(text.match(/Услышали: «/g)).toHaveLength(8)
    expect(text).toContain('ошибочная форма мелькала «try» 280 мс')
    expect(text).toContain('ошибочная форма мелькала «try» 120 мс')
    expect(text).toContain('ошибочная форма не мелькала')
  })
  it('несколько языков: таблица на язык и общая', () => {
    const s = feed([[0, 'errors', 280, { lang: 'en-GB' }], [0, 'control', null, { lang: 'en-GB' }]], state)
    const t = seriesFullLines(s).join('\n')
    expect(t).toContain('ПОРОГИ en-GB')
    expect(t).toContain('ПОРОГИ все языки')
  })
  it('пусто: так и пишем', () => {
    expect(seriesText(emptyState(), [])).toContain('результатов пока нет')
  })
  it('размер ≤ 6000 символов даже при двух языках и длинных данных', () => {
    let s = state
    for (const lang of ['en-GB', 'en-AU']) {
      for (const mode of MODES) for (let i = 0; i < 4; i++) s = recordEntry(s, entryOf(i, mode, 280, { lang, top1: "I'm trying to please both and also something quite long to push the size up a bit more" }))
    }
    const big = seriesText(s, langsWithData(s))
    expect(big.length).toBeLessThanOrEqual(SERIES_TEXT_MAX)
    expect(big).toContain('ПОРОГИ en-US')
    expect(big).toContain('РЕЖИМ «КОНТРОЛЬ»')
    expect(seriesText(s, langsWithData(s), 900).length).toBeLessThanOrEqual(900)
  })
})
