import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { chargePlan, chargeWords, chargeMs, chargeOn, levelColor, barHeight, flyDist, flyDx, bumpFrames, barKeys, START_BELOW_PX, BAR_BACK_MS, BAR_THIN_MS, BAR_MIN_PX, BAR_MAX_PX, BAR_FULL_PX, BAR_BUMP, BAR_BUMP_MS, CHARGE_FALLBACK_MS, CHARGE_MAX, CHARGE_SPARKS } from './raceCharge.js'
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
  it('без Math.random; стили подключены; цвета — переменные уровней памяти; бар заполненный без полос', () => {
    for (const f of ['./raceCharge.js', './RaceCharge.jsx']) expect(read(f)).not.toContain('Math.random')
    const css = read('../../styles/player/modules/race-charge.css')
    expect(read('../../styles/player/modules/race-sprint.css')).toContain("@import './race-charge.css';")
    expect(css).toContain('.wl[data-charge] .wlLanes'); expect(css).not.toContain('repeating-linear-gradient('); expect(css).not.toMatch(/\bfilter:/)
  })
  it('прилёт строго в центр бара: конечная точка пилюли (центр) = центр бара в момент касания, у каждой пилюли', () => {
    const height = 700, pillH = 28, barTop = 51, n = 9
    for (let i = 0; i < n; i++) {
      const dist = flyDist({ height, pillH, barTop, i, n })
      const pillCenterEnd = height + START_BELOW_PX + pillH / 2 - dist
      expect(pillCenterEnd).toBeCloseTo(barTop + barHeight(i + 1, n) / 2, 6)
    }
    expect(barHeight(0, 9)).toBe(BAR_MIN_PX); expect(barHeight(9, 9)).toBe(BAR_MAX_PX)
  })
  it('у каждой пилюли есть знак волны по семени (кривая — raceChargePath.js, тест raceChargePath.test.js)', () => {
    const { pills } = chargePlan(plan(), 5000)
    for (const p of pills) expect(p.wave.sign === 1 || p.wave.sign === -1).toBe(true)
  })
  it('бар: касание утолщает до 2× за ~180 мс, заполненный худеет до тонкой полоски (6 px), косых полос нет, пилюля летит до бара и гаснет там', () => {
    expect(BAR_BUMP).toBe(2); expect(BAR_BUMP_MS).toBe(220); expect(BAR_BACK_MS).toBe(260)
    expect(BAR_FULL_PX).toBeLessThan(BAR_MAX_PX); expect(BAR_FULL_PX).toBe(6)
    const src = read('./RaceCharge.jsx'), css = read('../../styles/player/modules/race-charge.css')
    expect(src).toContain('flyDist('); expect(src).toContain('BAR_BUMP'); expect(src).toContain('BAR_FULL_PX'); expect(src).not.toMatch(/data-full.*stripe|repeating/)
    expect(css).not.toContain('repeating-linear-gradient(')
  })
  it('старт пилюли ниже нижнего края (из-за затемнения) и прилёт строго в центр бара по x и по y', () => {
    expect(START_BELOW_PX).toBeGreaterThanOrEqual(40)
    expect(read('../../styles/player/modules/race-charge.css')).toContain(`top: calc(100% + ${START_BELOW_PX}px)`)
    const height = 700, pillH = 28, barTop = 51, n = 9, width = 375, barLeft = 16, barWidth = width - 76
    const { pills } = chargePlan(plan(), 5000)
    for (const p of pills) {
      const startTop = height + START_BELOW_PX // верх пилюли в начале пути: за нижним краем
      expect(startTop).toBeGreaterThan(height)
      const dx = flyDx({ width, x: p.x, barLeft, barWidth })
      expect((width * p.x) / 100 + dx).toBeCloseTo(barLeft + barWidth / 2, 6) // центр пилюли по x = центр бара
      const dist = flyDist({ height, pillH, barTop, i: p.i, n })
      expect(startTop + pillH / 2 - dist).toBeCloseTo(barTop + barHeight(p.i + 1, n) / 2, 6) // и по y
    }
  })
  it('касание бара: ease-in-out без первого кадра (берёт текущее значение), пик 2× в момент касания, возврат к 1; рост плавный', () => {
    const { frames, duration } = bumpFrames()
    expect(duration).toBe(BAR_BUMP_MS + BAR_BACK_MS)
    const peak = frames.find(f => f.scale === '1 2.0000')
    expect(peak.offset).toBeCloseTo(BAR_BUMP_MS / duration, 6); expect(frames.at(-1).scale).toBe('1 1.0000'); expect(frames.at(-1).offset).toBe(1)
    expect(frames[0].offset).toBeGreaterThan(0) // нет кадра в 0: старт — из-под анимации
    const v = frames.map(f => +f.scale.split(' ')[1])
    for (let i = 1; i < v.length; i++) expect(Math.abs(v[i] - v[i - 1])).toBeLessThan(0.45)
    expect(frames.map(f => f.offset)).toEqual([...frames.map(f => f.offset)].sort((a, b) => a - b))
  })
  it('толщина бара — одна анимация: офсеты не убывают, худение до 6 px начинается после возврата последнего касания и не пересекается с подъёмом', () => {
    for (const T of [2500, 4000, 7300]) {
      const { segments } = chargePlan(plan(), T)
      const { keys, duration } = barKeys(segments, T)
      const offs = keys.map(k => k.offset)
      expect(offs).toEqual([...offs].sort((a, b) => a - b)); expect(duration).toBe(T + BAR_BACK_MS + BAR_THIN_MS)
      expect(keys.at(-1)).toEqual({ height: `${BAR_FULL_PX}px`, offset: 1 })
      const thin = keys.at(-2), top = keys.at(-3)
      expect(thin.height).toBe(`${BAR_MAX_PX}px`); expect(thin.offset * duration).toBeCloseTo(T + BAR_BACK_MS, 3); expect(top.offset * duration).toBeLessThanOrEqual(T + 1e-6) // последний подъём кончился до худения
    }
    const src = read('./RaceCharge.jsx'); expect(src).not.toContain('BAR_THIN_MS'); expect(src).toContain('barKeys(')
  })
})
