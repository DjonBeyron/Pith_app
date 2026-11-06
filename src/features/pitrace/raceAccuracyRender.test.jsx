import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import RaceSummary from './RaceSummary.jsx'
import { scoreRace } from './raceSim.js'
import { weakWords } from './raceWeak.js'
import { withAccuracy } from './raceAccuracy.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'

// Финал: полоса точности у КАЖДОГО слова этапа (не только у слабых), процент и цветовой класс уровня; стили подключены рядом с race-final.css
const ok = (ms, o = {}) => ({ hit: true, miss: false, ms, life: 4000, fill: 0.85, ...o }), bad = { hit: false, miss: true }
const race = {
  sprint: { words: ['a', 'b', 'c'], caps: { a: 'а' }, results: { 0: ok(0), 1: bad, 2: ok(2000) }, r2: null },
  catch: { words: ['d', 'e'], caps: {}, traps: [false, false], results: { 0: ok(400), 1: bad }, r2: null },
}
const plan = normalizePlan({ ...fixturePlan('three'), game: 'race', round: 'stages' })
const weak = withAccuracy(race, weakWords(race, Infinity))
const result = { sprint: { hit: 2, total: 3 }, catchOk: 1, catchTotal: 2, medal: 'none', descent: null, xp: 1, capped: false, gold: false, metrics: null, weak }
const html = renderToStaticMarkup(createElement(RaceSummary, { plan, result, onDone() {} }))

describe('итог: полоса точности у каждого слова', () => {
  it('все пять слов обоих проходов в списке, у каждого полоса', () => {
    expect(weak.map(w => w.text).sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(html.match(/data-testid="race-weak-chip"/g)).toHaveLength(5)
    expect(html.match(/data-testid="race-acc"/g)).toHaveLength(5)
  })
  it('процент, ширина заливки и класс уровня соответствуют точности слова', () => {
    for (const w of weak) {
      expect(html).toContain(`class="raceAcc raceAcc--${w.acc.level}" data-testid="race-acc" data-level="${w.acc.level}"`)
      expect(html).toContain(`width:${w.acc.pct}%`)
    }
    const a = weak.find(w => w.text === 'a'), b = weak.find(w => w.text === 'b')
    expect(a.acc).toMatchObject({ pct: 100, level: 4 }); expect(b.acc).toMatchObject({ pct: 0, level: 0 })
    expect(html).toContain('>100 %</b>'); expect(html).toContain('>0 %</b>')
  })
  it('слабые сверху: не засчитанные слова — первыми; расшифровка одной строкой', () => {
    expect(weak.slice(0, 2).map(w => w.text).sort()).toEqual(['b', 'e'])
    expect(html).toContain('data-testid="race-acc-note">A не успел<'); expect(html).toContain('>B 0,4 с<')
  })
  it('итог scoreRace отдаёт точность всем словам (больше 12 слов тоже)', () => {
    const many = Array.from({ length: 14 }, (_, i) => `w${i}`)
    const r = scoreRace(plan, { sprint: { words: many, caps: {}, results: {}, r2: null }, catch: { words: [], caps: {}, traps: [], results: {}, r2: null }, climb: null, descent: null })
    expect(r.weak).toHaveLength(14); expect(r.weak.every(w => w.acc && w.acc.pct === 0)).toBe(true)
  })
  it('стили: race-accuracy.css подключён рядом с race-final.css, цвета — ступени памяти, без filter и анимаций', () => {
    const sum = readFileSync(new URL('../../styles/player/modules/race-summary.css', import.meta.url), 'utf8')
    expect(sum).toContain("@import './race-accuracy.css'")
    const css = readFileSync(new URL('../../styles/player/modules/race-accuracy.css', import.meta.url), 'utf8')
    for (const n of [1, 2, 3, 4]) expect(css).toContain(`.raceAcc--${n} { --acc: var(--lvl${n}-rgb); }`)
    expect(css).not.toMatch(/filter\s*:|animation|transition/)
  })
})
