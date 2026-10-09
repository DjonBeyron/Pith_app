import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { VOSK_SERIES_HOWTO } from './antiPredictInfo.js'

// Стражи вёрстки «Теста 3» (Vosk): виден сразу, шпаргалка из 3 шагов, широкие таблицы только в «Подробнее», один микрофон на всех
const src = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
const withoutMore = text => text.replace(/<details className="apMore">[\s\S]*?<\/details>/g, '')

describe('Тест 3 (Vosk) на виду', () => {
  it('стоит в «Простых тестах» вне <details>, заголовок крупный', () => {
    const t = src('SimpleTestsBlock.jsx')
    expect(t).toContain('<VoskSeriesBlock')
    expect(t).not.toContain('<details')
    expect(src('VoskSeriesBlock.jsx')).toContain('Тест 3. Vosk — закрытый словарь (усложнённый)')
  })
  it('без загруженной модели — кнопка «Сначала загрузите движок»', () => {
    const t = src('VoskSeriesBlock.jsx')
    expect(t).toContain('Сначала загрузите движок')
    expect(t).toContain('!eng.loaded')
  })
  it('шпаргалка: 3 шага без терминов', () => {
    expect(VOSK_SERIES_HOWTO).toHaveLength(3)
    for (const t of VOSK_SERIES_HOWTO) expect(t).not.toMatch(/interim|n-best|top-?1|consensus|endpoint|conf\b/i)
  })
  it('широкая таблица прогонов — только внутри «Подробнее»; в карточках и панелях таблиц нет', () => {
    const outside = withoutMore(src('VoskSeriesBlock.jsx'))
    expect(outside).not.toContain('<VoskRunsTable')
    expect(src('VoskSeriesBlock.jsx')).toContain('<VoskRunsTable')
    for (const f of ['VoskCards.jsx', 'VoskCtxPanel.jsx', 'VoskTrapsBlock.jsx', 'VoskPairsBlock.jsx']) expect(withoutMore(src(f)), f).not.toContain('<table')
  })
  it('карточка показывает «Услышали», пословные уверенности и тайминги', () => {
    const t = src('VoskCards.jsx')
    expect(t).toContain('Услышали')
    expect(t).toContain('wordLine')
    expect(t).toContain('timeLine')
  })
  it('есть явная кнопка «Стоп», «Тишина 3 с», «Скопировать итог Vosk-серии», счётчик ложных принятий', () => {
    expect(src('VoskCards.jsx')).toContain('Стоп')
    expect(src('VoskTrapsBlock.jsx')).toContain('Тишина 3 с')
    expect(src('VoskTrapsBlock.jsx')).toContain('ложных принятий')
    expect(src('VoskSeriesBlock.jsx')).toContain('Скопировать итог Vosk-серии')
  })
})

describe('один микрофон на всех и запись только по нажатию', () => {
  it('VoskLab отдаёт модель в общее хранилище и блокируется, пока пишет «Тест 3»', () => {
    const t = src('VoskLab.jsx')
    expect(t).toContain('setVoskModel(r.model')
    expect(t).toContain('setVoskModel(null)')
    expect(t).toContain('disabled={other}')
  })
  it('микрофон открывается только из run() по нажатию: listen нигде не вызывается из эффектов', () => {
    const h = src('useVoskSeries.js')
    expect(h).toContain('e.listen(')
    expect(h.match(/\.listen\(/g)).toHaveLength(1)
    expect(h).not.toMatch(/useEffect\([^)]*listen/)
  })
  it('все новые файлы Vosk-серии не длиннее 250 строк', () => {
    const files = readdirSync(new URL('./', import.meta.url)).filter(f => /^(vosk(Series|Grammar|Classify|Traps|Threshold|Timing|Summary|SeriesReport|Session)|useVoskSeries|Vosk(Series|Cards|Ctx|Traps|Pairs|Summary|Settings|Runs))/.test(f) && !f.endsWith('.test.js'))
    expect(files.length).toBeGreaterThan(10)
    for (const f of files) expect(src(f).split('\n').length, f).toBeLessThanOrEqual(250)
  })
})
