import { describe, it, expect } from 'vitest'
import { stepAsk, stepTitle, heardLine, confLine, plainVerdict, liveLine, compareLines, detailLines, NOT_SAID } from './seriesCards.js'
import { emptyState, recordEntry, DEFAULT_REFS } from './contextSeries.js'

const cfg = { word: 'trying', wrong: 'try' }
const row = (over = {}) => ({ step: 1, top1: "I'm trying", conf: 86, kind: 'ref', fixed: false, literal: [], alts: [], hist: [], ...over })

describe('заголовок шага и главная строка карточки', () => {
  it('«Шаг 2 — нужно было сказать: «I\'m try»»; слова нет в эталоне — шаг не годится', () => {
    expect(stepTitle(1, "I'm try", 'trying')).toBe("Шаг 2 — нужно было сказать: «I'm try»")
    expect(stepAsk(null, 'going')).toContain('шаг не годится')
  })
  it('«Услышали: «…»» или «ещё не говорили»; уверенность мелко', () => {
    expect(heardLine(row())).toBe("Услышали: «I'm trying»")
    expect(heardLine(null)).toBe(NOT_SAID)
    expect(confLine(row())).toBe('уверенность 86%')
    expect(confLine(row({ conf: null }))).toBe('')
    expect(confLine(null)).toBe('')
  })
})

describe('plainVerdict: вывод простыми словами из kind/fixed', () => {
  it('буквально → записал как сказано', () => {
    expect(plainVerdict(row({ kind: 'wrong', top1: "I'm try" }), cfg)).toEqual({ tone: 'ok', text: '✅ Движок записал как сказано' })
  })
  it('исправлено → «ИСПРАВИЛ: «try» → «trying»»; fixed добавляет «видно по ходу речи»', () => {
    expect(plainVerdict(row(), cfg)).toEqual({ tone: 'fixed', text: '⚠ Движок ИСПРАВИЛ: «try» → «trying»' })
    expect(plainVerdict(row({ fixed: true }), cfg).text).toContain('по ходу речи')
  })
  it('иное слово → «выдал другое слово: …»; нет результата → пусто', () => {
    expect(plainVerdict(row({ kind: 'other', top1: 'hello' }), cfg)).toEqual({ tone: 'other', text: '⚠ Движок выдал другое слово: «hello»' })
    expect(plainVerdict(null, cfg)).toEqual({ tone: 'none', text: '' })
  })
  it('в формулировках нет терминов', () => {
    for (const r of [row(), row({ kind: 'wrong' }), row({ kind: 'other' })]) expect(plainVerdict(r, cfg).text).not.toMatch(/interim|N-best|top-?1|consensus/i)
  })
})

describe('liveLine: «Слышу…» во время записи и «Услышали» после', () => {
  it('идёт запись с interim → «Слышу: «…»»; без текста — «Слушаю…»', () => {
    expect(liveLine({ runNo: 1, status: 'listening', interim: "I'm tr" })).toEqual({ tone: 'live', text: "Слышу: «I'm tr»" })
    expect(liveLine({ runNo: 1, status: 'listening', interim: '' }).tone).toBe('wait')
  })
  it('есть итог → «Услышали: «…»»; попыток не было / нет итога → null', () => {
    expect(liveLine({ runNo: 2, status: 'done', interim: '', final: { text: "I'm trying" } })).toEqual({ tone: 'final', text: "Услышали: «I'm trying»" })
    expect(liveLine({ runNo: 0 })).toBeNull()
    expect(liveLine({ runNo: 2, status: 'done', final: null })).toBeNull()
    expect(liveLine(null)).toBeNull()
  })
})

describe('«Языки рядом» простыми строками и «Подробнее»', () => {
  const entry = (lang, step, top1) => ({ t: 1, tx: { ref: DEFAULT_REFS[step], said: 'x', lang, series: { step }, top1: { text: top1, conf: 50 }, alts: [], literal: [], verdicts: null } })
  it('строка на шаг: Шаг 2 · en-US: Услышали «…» · en-GB: Услышали «…»; без данных — «ещё не говорили»', () => {
    let s = recordEntry(emptyState(), entry('en-US', 1, "I'm try"))
    s = recordEntry(s, entry('en-GB', 1, "I'm trying"))
    s = recordEntry(s, entry('en-US', 2, 'hello'))
    expect(compareLines(s, ['en-US', 'en-GB'])).toEqual([
      "Шаг 2 · en-US: Услышали «I'm try» · en-GB: Услышали «I'm trying»",
      `Шаг 3 · en-US: Услышали «hello» · en-GB: ${NOT_SAID}`,
    ])
    expect(compareLines(emptyState(), ['en-US'])).toEqual([])
  })
  it('detailLines: правила, где литерально, другие варианты, текст по ходу речи', () => {
    const lines = detailLines(row({ literal: ['interim@1.0s'], alts: ['I am trying 40'], hist: [{ t: 400, text: "I'm try" }, { t: 900, text: "I'm trying", final: true }] }), 'top1=пропустило')
    expect(lines).toEqual([
      'Правила проверки: top1=пропустило', 'Где встретилась сказанная форма: interim@1.0s', 'Другие варианты движка: I am trying 40',
      "Как менялся текст по ходу речи: 0.4 с «I'm try» → 0.9 с «I'm trying» (итог)",
    ])
    expect(detailLines(null, '')).toEqual([])
    expect(detailLines(row(), 'нет данных')[1]).toContain('нигде')
  })
})
