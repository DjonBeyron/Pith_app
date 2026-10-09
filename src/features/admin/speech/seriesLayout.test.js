import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { SERIES_HOWTO, RESTART_HOWTO } from './antiPredictInfo.js'
import { emptyState, recordEntry, seriesLines, DEFAULT_REFS } from './contextSeries.js'

// Стражи вёрстки серий (читаем исходники): серии видны сразу, понятны без терминов, широкие таблицы — только внутри «Подробнее»
const src = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
const withoutMore = text => text.replace(/<details className="apMore">[\s\S]*?<\/details>/g, '') // нижний «Подробнее» без вложенных details внутри

describe('серии видны сразу, не внутри свёрнутого блока', () => {
  it('SimpleTestsBlock показывает оба теста и сам не содержит <details>', () => {
    const t = src('SimpleTestsBlock.jsx')
    expect(t).toContain('<ContextSeriesBlock')
    expect(t).toContain('<RestartSeriesBlock')
    expect(t).not.toContain('<details')
  })
  it('свёрнутый блок «Дополнительно» больше не содержит серий', () => {
    const t = src('AntiPredictBlock.jsx')
    expect(t).not.toContain('ContextSeriesBlock')
    expect(t).not.toContain('RestartSeriesBlock')
    expect(t).toContain('Дополнительно: остальные эксперименты')
    expect(src('SpeechTestBlock.jsx')).not.toContain('RestartSeriesBlock')
  })
  it('на вкладке «Голос» простые тесты стоят до блока «Проверка» (после «Сказать фразу»)', () => {
    const t = src('AdminSpeechTab.jsx')
    const at = s => t.indexOf(`<${s}`)
    expect(at('SpeechSayBlock')).toBeGreaterThan(-1)
    expect(at('SimpleTestsBlock')).toBeGreaterThan(at('SpeechSayBlock'))
    expect(at('SpeechTestBlock')).toBeGreaterThan(at('SimpleTestsBlock'))
  })
  it('у тестов крупные понятные заголовки; кнопки «Сказать»/«Стоп» и живая строка прямо в тесте', () => {
    const c = src('ContextSeriesBlock.jsx')
    const r = src('RestartSeriesBlock.jsx')
    expect(c).toContain('Тест 1. Исправляет ли движок мою ошибку? (серия из 4 шагов)')
    expect(r).toContain('Тест 2. Не глохнет ли микрофон? (серия из 6 нажатий)')
    for (const t of [c, r]) { expect(t).toContain('<LiveHeard'); expect(t).toContain('Стоп'); expect(t).toContain('Скопировать итог серии') }
    expect(r.startsWith('import')).toBe(true)
    expect(withoutMore(r)).not.toContain('<details className="apBox">')
  })
})

describe('простой вид: «Услышали» есть, широких таблиц вне «Подробнее» нет', () => {
  it('в блоках серий <table> и ResultTable/CompareTable только внутри <details className="apMore">', () => {
    for (const f of ['ContextSeriesBlock.jsx', 'RestartSeriesBlock.jsx', 'SeriesStepCard.jsx']) {
      const outside = withoutMore(src(f))
      expect(outside, f).not.toContain('<table')
      expect(outside, f).not.toContain('<ResultTable')
      expect(outside, f).not.toContain('<CompareTable')
    }
    expect(src('ContextSeriesBlock.jsx')).toContain('<ResultTable') // а внутри «Подробнее» — на месте
    expect(src('RestartSeriesBlock.jsx')).toContain('<table')
  })
  it('карточка шага показывает строку «Услышали» и вывод простыми словами', () => {
    const t = src('SeriesStepCard.jsx')
    expect(t).toContain('heardLine(row)')
    expect(t).toContain('plainVerdict(')
    expect(src('seriesCards.js')).toContain('Услышали')
    expect(src('restartCards.js')).toContain('Услышали')
    expect(src('seriesCards.js')).toContain('Слышу')
  })
  it('шпаргалки: по 3 коротких шага без терминов', () => {
    for (const list of [SERIES_HOWTO, RESTART_HOWTO]) {
      expect(list).toHaveLength(3)
      for (const t of list) expect(t).not.toMatch(/interim|n-best|top-?1|consensus|audiostart/i)
    }
    expect(SERIES_HOWTO.join(' ')).toContain('Шаг 1')
    expect(RESTART_HOWTO.join(' ')).toMatch(/S1/)
  })
})

describe('«Скопировать итог серии»: «Услышали» на каждый шаг', () => {
  it('для каждого шага строка «Услышали: «…»» и вывод простыми словами', () => {
    let s = emptyState()
    const words = ["try", "I'm try", "I'm trying to please", "I'm try to please both"]
    words.forEach((w, i) => {
      s = recordEntry(s, { t: i, tx: { ref: DEFAULT_REFS[i], said: 'x', lang: 'en-US', series: { step: i }, top1: { text: w, conf: 70 }, alts: [], literal: w.includes('trying') ? [] : ['top1'], verdicts: { top1: w.includes('trying') } } })
    })
    const lines = seriesLines(s)
    words.forEach((w, i) => expect(lines.some(l => l.startsWith(`  Шаг ${i + 1} · Услышали: «${w}»`))).toBe(true))
    expect(lines.join('\n')).toContain('Движок ИСПРАВИЛ')
    expect(lines.join('\n')).toContain('Движок записал как сказано')
  })
})
