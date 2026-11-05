import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { raceMetrics, fmtMs } from './raceMetrics.js'
import RaceSummary from './RaceSummary.jsx'
import RaceBlock from '../admin/speech/RaceBlock.jsx'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'

vi.mock('../../shared/lib/vosk/useVoskReady.js', () => ({ useVoskReady: () => ({ status: 'preparing', download() {}, retry() {} }) }))

// Метрики итога (raceMetrics.js) и их показ в RaceSummary / кнопка режима «два этапа + финал» в RaceBlock.
const ok = ms => ({ hit: true, miss: false, ms }), bad = { hit: false, miss: true }
const race = {
  sprint: { words: ['a', 'b', 'c', 'd'], results: { 0: ok(900), 1: bad, 2: ok(1500), 3: ok(1200) }, r2: { words: ['b'], results: { 0: ok(2400) } } },
  catch: { words: ['x', 'y', 'z', 'w'], traps: [false, true, false, true], results: { 0: ok(1100), 1: { hit: true, miss: false, trap: true }, 2: bad, 3: { hit: true, miss: true, believed: true, trap: true } }, r2: null },
}
const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })
const html = (props, p = plan) => renderToStaticMarkup(createElement(RaceSummary, { plan: p, onDone() {}, ...props }))

describe('метрики итога: raceMetrics', () => {
  it('точность по этапам (первый круг), среднее время ответа, самое медленное слово, ловушки', () => {
    const m = raceMetrics(race)
    expect(m.accuracy).toEqual({ sprint: { hit: 3, total: 4 }, catch: { hit: 2, total: 4 } })
    expect(m.avgMs).toBe(Math.round((900 + 1500 + 1200 + 2400 + 1100) / 5)) // верные ответы с временем обоих этапов и кругов
    expect(m.slowest).toEqual({ text: 'b', ms: 2400 }) // слово из второго круга — по тексту круга
    expect(m.traps).toEqual({ dodged: 1, total: 2 }) // одна ловушка пропущена, на другую поверил
  })
  it('нет этапа / нет ответов с временем / нет ловушек — null и нули, без падения', () => {
    expect(raceMetrics(null)).toEqual({ accuracy: { sprint: null, catch: null }, avgMs: null, slowest: null, traps: { dodged: 0, total: 0 } })
    const only = raceMetrics({ sprint: { words: ['a'], results: { 0: ok(500) }, r2: null }, catch: { words: [], traps: [], results: {}, r2: null } })
    expect(only.accuracy.catch).toBeNull(); expect(only.avgMs).toBe(500); expect(only.traps.total).toBe(0)
  })
  it('время для экрана: секунды с запятой', () => { expect(fmtMs(1234)).toBe('1,2 с'); expect(fmtMs(900)).toBe('0,9 с') })
  it('чистая функция: без Math.random и без часов', () => {
    const src = readFileSync(new URL('./raceMetrics.js', import.meta.url), 'utf8')
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now/)
  })
})

describe('итог: метрики над «Слабыми словами», режим «Вспомни на слух + финал»', () => {
  const result = { sprint: { hit: 3, total: 4 }, catchOk: 2, catchTotal: 4, medal: 'none', descent: null, xp: 1, capped: false, gold: false, metrics: raceMetrics(race), weak: [{ text: 'b', translation: 'б', score: 5, tone: 'red' }] }
  it('две строки: точность по этапам и время ответа / ловушки; блок идёт перед «Слабыми словами»; без таблицы', () => {
    const h = html({ result })
    expect(h).toContain('data-testid="race-metrics"')
    expect(h).toMatch(/data-testid="race-metrics-sprint">Скажи слово <b>3\/4<\/b>/); expect(h).toMatch(/data-testid="race-metrics-catch">Назови перевод <b>2\/4<\/b>/)
    expect(h).toContain('в среднем <b>1,4 с</b>'); expect(h).toContain('дольше всего «b» <b>2,4 с</b>'); expect(h).toContain('ловушки <b>1/2</b>')
    expect(h.match(/class="raceMetricsRow"/g)).toHaveLength(2); expect(h).not.toContain('<table')
    expect(h.indexOf('race-metrics')).toBeLessThan(h.indexOf('race-weak')); expect(h.indexOf('race-summary-xp')).toBeLessThan(h.indexOf('race-metrics"'))
  })
  it('без метрик (итог ещё считается или нет данных) блока нет; без ловушек и времени частей нет', () => {
    expect(html({ result: null })).not.toContain('race-metrics')
    const m = raceMetrics({ sprint: { words: ['a'], results: { 0: bad }, r2: null } })
    const h = html({ result: { ...result, metrics: m } })
    expect(h).toContain('race-metrics-acc'); expect(h).not.toContain('race-metrics-time'); expect(h).not.toContain('race-metrics-traps')
  })
  it('режим «Вспомни на слух + финал» (plan.round = stages): строк «Вершина» и «Спуск» нет, разгон, слух и XP остаются; в полной гонке они есть', () => {
    const two = html({ result }, normalizePlan({ ...fixturePlan('three'), game: 'race', round: 'stages' }))
    expect(two).not.toContain('race-summary-climb'); expect(two).not.toContain('race-summary-descent')
    expect(two).toContain('race-summary-sprint'); expect(two).toContain('race-summary-catch'); expect(two).toContain('race-summary-xp'); expect(two).toContain('race-metrics')
    expect(two).not.toContain('race-again') // одна «партия»: «Ещё заезд» только в полной гонке (RotatePhoneModule: plan.round)
    const full = html({ result })
    expect(full).toContain('race-summary-climb'); expect(full).toContain('race-summary-descent')
  })
  it('стили метрик подключены к итогу', () => {
    expect(readFileSync(new URL('../../styles/player/modules/race-summary.css', import.meta.url), 'utf8')).toContain("@import './race-metrics.css'")
    expect(readFileSync(new URL('../../styles/player/modules/race-metrics.css', import.meta.url), 'utf8')).not.toMatch(/filter\s*:/)
  })
})

describe('стенд: кнопка «Вспомни на слух + финал»', () => {
  it('в блоке гонки рядом с «Полной гонкой» и раундами; запускает round = stages', () => {
    const h = renderToStaticMarkup(createElement(RaceBlock))
    expect(h).toContain('data-testid="race-run-full"'); expect(h).toContain('data-testid="race-run-stages"'); expect(h).toContain('>Вспомни на слух + финал<')
    expect(readFileSync(new URL('../admin/speech/RaceBlock.jsx', import.meta.url), 'utf8')).toContain('launch(STAGES_ROUND)')
  })
})
