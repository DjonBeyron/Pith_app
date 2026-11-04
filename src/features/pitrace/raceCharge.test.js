import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { chargePlan, chargeWords, chargeMs, chargeOn, levelColor, CHARGE_FALLBACK_MS, CHARGE_MAX, CHARGE_SPARKS } from './raceCharge.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'
import { extrasOf } from './raceWords.js'

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const plan = (id = 'three', extra = {}) => { const p = normalizePlan({ ...fixturePlan(id), game: 'race', ...extra }); return { ...p, extraWords: extrasOf(p) } }

describe('заставка-зарядка: план', () => {
  it('слова — слова плана и extraWords без повторов, не больше CHARGE_MAX, у каждого level 0–4', () => {
    const w = chargeWords(plan())
    expect(w.length).toBeGreaterThan(3); expect(w.length).toBeLessThanOrEqual(CHARGE_MAX)
    expect(new Set(w.map(x => x.text.toLowerCase())).size).toBe(w.length)
    expect(w.every(x => x.level >= 0 && x.level <= 4)).toBe(true)
    expect(w.find(x => x.text === 'learn').level).toBe(0); expect(w.find(x => x.text === 'trying').level).toBe(2)
  })
  it('последняя пилюля прилетает ровно в T, остальные раньше; старт не отрицательный, порядок прилёта по возрастанию', () => {
    for (const T of [4000, 7300, 2500]) {
      const { pills, totalMs } = chargePlan(plan(), T)
      expect(totalMs).toBe(T)
      expect(pills.at(-1).arriveAt).toBe(T)
      expect(Math.max(...pills.map(p => p.arriveAt))).toBe(T)
      pills.forEach((p, i) => { expect(p.startAt).toBeGreaterThanOrEqual(0); expect(p.startAt + p.flyMs).toBe(p.arriveAt); if (i) expect(p.arriveAt).toBeGreaterThanOrEqual(pills[i - 1].arriveAt) })
    }
  })
  it('цвет пилюли и сегмента — по ступени памяти слова (--lvl0…--lvl4)', () => {
    const { pills, segments } = chargePlan(plan(), 5000)
    pills.forEach((p, i) => { expect(p.color).toBe(`var(--lvl${p.level})`); expect(segments[i].color).toBe(p.color) })
    expect(levelColor(0)).toBe('var(--lvl0)'); expect(levelColor(4)).toBe('var(--lvl4)'); expect(levelColor(9)).toBe('var(--lvl4)')
    expect(new Set(pills.map(p => p.level)).size).toBeGreaterThan(1) // в фикстурах разные ступени
  })
  it('сегменты бара подряд, без щелей, в сумме 100 %; каждая пилюля — свой сегмент, прилёт совпадает', () => {
    const { pills, segments } = chargePlan(plan(), 6000)
    expect(segments).toHaveLength(pills.length)
    expect(segments[0].from).toBe(0); expect(segments.at(-1).to).toBe(100)
    segments.forEach((s, i) => { if (i) expect(s.from).toBeCloseTo(segments[i - 1].to, 2); expect(s.at).toBe(pills[i].arriveAt) })
    expect(segments.reduce((a, s) => a + (s.to - s.from), 0)).toBeCloseTo(100, 1)
  })
  it('от семени: одно семя — тот же план, другое — другая раскладка; искры 2–3 px', () => {
    const a = chargePlan(plan(), 5000), b = chargePlan(plan(), 5000), c = chargePlan(plan('three', { seed: 'другое семя' }), 5000)
    expect(b).toEqual(a); expect(c.pills.map(p => p.x)).not.toEqual(a.pills.map(p => p.x))
    expect(a.sparks).toHaveLength(CHARGE_SPARKS); expect(CHARGE_SPARKS).toBeGreaterThanOrEqual(20); expect(CHARGE_SPARKS).toBeLessThanOrEqual(30)
    expect(a.sparks.every(s => s.size >= 2 && s.size <= 3 && s.startAt >= 0)).toBe(true)
    expect(a.pills.every(p => p.x >= 14 && p.x <= 86)).toBe(true)
  })
  it('пустой план слов — пустая заставка; без озвучки T = 4 с, с озвучкой — сумма lineMs', () => {
    expect(chargePlan({ seed: 's', words: [], chunks: ['a'], extraWords: [] }, 4000).pills.length).toBeGreaterThanOrEqual(0)
    expect(chargeMs(null, ['race_start', 'race_sprint'])).toBe(CHARGE_FALLBACK_MS)
    const lines = { race_start: { text: 'a', url: 'u1', duration: 2.5 }, race_sprint: { text: 'b', url: 'u2', duration: 3 } }
    expect(chargeMs(lines, ['race_start', 'race_sprint'])).toBe(5500)
    expect(chargeMs({ race_start: lines.race_start }, ['race_start', 'race_sprint'])).toBe(2500) // озвучена одна — считаем её
  })
  it('заставка идёт на drop, lanes и на плашке первого этапа; на первом раунде и дальше — нет', () => {
    expect(chargeOn({ stage: 'drop' })).toBe(true); expect(chargeOn({ stage: 'lanes' })).toBe(true)
    expect(chargeOn({ stage: 'run', idx: 0, stageObj: { type: 'announce' } })).toBe(true)
    expect(chargeOn({ stage: 'run', idx: 1, stageObj: { type: 'student' } })).toBe(false)
    expect(chargeOn({ stage: 'paused', idx: 0 })).toBe(true); expect(chargeOn({ stage: 'paused', idx: 4 })).toBe(false)
  })
  it('без Math.random; стили подключены; цвета — переменные уровней памяти; бар заполненный полосатый', () => {
    for (const f of ['./raceCharge.js', './RaceCharge.jsx']) expect(read(f)).not.toContain('Math.random')
    const css = read('../../styles/player/modules/race-charge.css')
    expect(read('../../styles/player/modules/race-sprint.css')).toContain("@import './race-charge.css';")
    expect(css).toContain('.wl[data-charge] .wlLanes'); expect(css).toContain('repeating-linear-gradient(45deg'); expect(css).not.toMatch(/\bfilter:/)
  })
})
