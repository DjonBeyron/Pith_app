import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { chargePlan, chargeWords, chargeOn, levelColor, flyDist, flyDx, haloKeys, nudgeFrames, ringFrames, START_BELOW_PX, BAR_CORE_PX, HALO_MAX, HALO_RISE_MS, FLASH_MS, RING_MS, NUDGE_PX, NUDGE_MS, CHARGE_MAX, CHARGE_SPARKS } from './raceCharge.js'
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
  it('пустой план слов — пустая заставка; по умолчанию слова летят 4 с', () => {
    expect(chargePlan({ seed: 's', words: [], chunks: ['a'], extraWords: [] }, 4000).pills.length).toBeGreaterThanOrEqual(0)
    expect(chargePlan(plan()).totalMs).toBe(4000)
  })
  it('заставка идёт на drop, lanes и на плашке первого этапа; на первом раунде и дальше — нет', () => {
    expect(chargeOn({ stage: 'drop' })).toBe(true); expect(chargeOn({ stage: 'lanes' })).toBe(true)
    expect(chargeOn({ stage: 'run', idx: 0, stageObj: { type: 'announce' } })).toBe(true)
    expect(chargeOn({ stage: 'run', idx: 1, stageObj: { type: 'student' } })).toBe(false)
    expect(chargeOn({ stage: 'paused', idx: 0 })).toBe(true); expect(chargeOn({ stage: 'paused', idx: 4 })).toBe(false)
    expect(chargeOn({ stage: 'drop', hold: true })).toBe(false) // сцена открыта, звук готовится: заставка ещё не началась
  })
  it('без Math.random; стили подключены; цвета — переменные уровней памяти; бар заполненный без полос', () => {
    for (const f of ['./raceCharge.js', './RaceCharge.jsx', './RaceChargeRun.jsx', './RaceRoundCharge.jsx', './raceRound.js', './raceBar.js', './RaceBar.jsx']) expect(read(f)).not.toContain('Math.random')
    const css = read('../../styles/player/modules/race-charge.css')
    expect(read('../../styles/player/modules/race-sprint.css')).toContain("@import './race-charge.css';")
    expect(css).toContain('.wl[data-charge] .wlLanes'); expect(css).not.toContain('repeating-linear-gradient('); expect(css).not.toMatch(/\bfilter:/)
  })
  it('прилёт строго в центр бара: конечная точка пилюли (центр) = центр бара (постоянной высоты BAR_CORE_PX) в момент касания, у каждой пилюли', () => {
    const height = 700, pillH = 28, barTop = 51
    const dist = flyDist({ height, pillH, barTop })
    expect(height + START_BELOW_PX + pillH / 2 - dist).toBeCloseTo(barTop + BAR_CORE_PX / 2, 6)
    expect(BAR_CORE_PX).toBe(6)
  })
  it('у каждой пилюли есть знак волны по семени (кривая — raceChargePath.js, тест raceChargePath.test.js)', () => {
    const { pills } = chargePlan(plan(), 5000)
    for (const p of pills) expect(p.wave.sign === 1 || p.wave.sign === -1).toBe(true)
  })
  it('бар: высота постоянная (не анимируется), скругление 999px; «толщину» даёт ореол — scaleY от центра; импакт — только transform / opacity', () => {
    const src = read('./RaceChargeRun.jsx'), css = read('../../styles/player/modules/race-charge.css')
    expect(src).toContain('flyDist('); expect(src).toContain('haloKeys('); expect(src).toContain('nudgeFrames('); expect(src).toContain('ringFrames(')
    expect(src).not.toMatch(/height:\s*`/); expect(src).not.toContain('barKeys'); expect(src).not.toContain('bumpFrames') // высота бара не анимируется
    expect(css).toMatch(/\.raceChargeBar \{[^}]*height: 6px;/); expect(css).toMatch(/\.raceChargeHalo \{[^}]*border-radius: 999px;[^}]*transform-origin: center/); expect(css).toMatch(/\.raceChargeTrack \{[^}]*border-radius: 999px/)
    expect(css).not.toContain('repeating-linear-gradient('); expect(css).not.toMatch(/\bfilter:/)
  })
  it('ореол: scaleY ступенькой за пилюлю от 1 до HALO_MAX, подъём за HALO_RISE_MS до касания, офсеты не убывают, последний кадр = прилёт последней', () => {
    for (const T of [2500, 4000, 7300]) {
      const { segments } = chargePlan(plan(), T)
      const { keys, duration } = haloKeys(segments)
      expect(duration).toBe(segments.at(-1).at)
      const offs = keys.map(k => k.offset); expect(offs).toEqual([...offs].sort((a, b) => a - b))
      const v = keys.map(k => +k.transform.match(/scaleY\(([\d.]+)\)/)[1])
      expect(v[0]).toBe(1); expect(v.at(-1)).toBeCloseTo(HALO_MAX, 3); expect(Math.max(...v)).toBeLessThanOrEqual(HALO_MAX + 1e-9)
      for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThanOrEqual(v[i - 1] - 1e-9) // только растёт
      expect(keys.at(-1).offset).toBe(1)
      const k0 = keys[2]; expect(k0.offset * duration).toBeCloseTo(segments[0].at, 3); expect(keys[1].offset * duration).toBeCloseTo(Math.max(segments[0].at - HALO_RISE_MS, 0), 3)
    }
    expect(haloKeys([]).keys.length).toBeGreaterThan(0)
  })
  it('импакт: толчок бара translateY 2 px и обратно (200 мс), кольцо scale 0,6 → 1,6 и opacity → 0 за 350 мс, вспышка сегмента opacity 0,9 → 0 за 300 мс', () => {
    const n = nudgeFrames()
    expect(NUDGE_PX).toBe(2); expect(n.duration).toBe(NUDGE_MS); expect(n.frames.map(f => f.transform)).toEqual(['translateY(0)', 'translateY(2px)', 'translateY(0)']); expect(n.frames.map(f => f.offset)).toEqual([0, 0.35, 1])
    const r = ringFrames()
    expect(RING_MS).toBe(350); expect(r.duration).toBe(350); expect(r.frames[0].transform).toContain('scale(0.6)'); expect(r.frames.at(-1).transform).toContain('scale(1.6)'); expect(r.frames[0].opacity).toBeGreaterThan(0); expect(r.frames.at(-1).opacity).toBe(0)
    const css = read('../../styles/player/modules/race-charge.css')
    expect(FLASH_MS).toBe(300); expect(css).toMatch(/\.raceChargeSeg::after \{[^}]*animation: raceHit 0\.3s linear var\(--at, 0s\) 1 forwards/); expect(css).toContain('@keyframes raceHit { from { opacity: 0.9; } to { opacity: 0; } }')
    expect(css).toMatch(/\.raceChargeSeg::after \{[^}]*opacity: 0;/) // до момента касания вспышки нет
    const src = read('./RaceChargeRun.jsx'); expect((src.match(/data-ring/g) ?? []).length).toBe(2) // один узел кольца на бар (разметка + выбор), не по узлу на касание
  })
  it('старт пилюли ниже нижнего края (из-за затемнения) и прилёт строго в центр бара по x и по y', () => {
    expect(START_BELOW_PX).toBeGreaterThanOrEqual(40)
    expect(read('../../styles/player/modules/race-charge.css')).toContain(`top: calc(100% + ${START_BELOW_PX}px)`)
    const height = 700, pillH = 28, barTop = 51, width = 375, barLeft = 16, barWidth = width - 76
    const { pills } = chargePlan(plan(), 5000)
    for (const p of pills) {
      const startTop = height + START_BELOW_PX // верх пилюли в начале пути: за нижним краем
      expect(startTop).toBeGreaterThan(height)
      const dx = flyDx({ width, x: p.x, barLeft, barWidth })
      expect((width * p.x) / 100 + dx).toBeCloseTo(barLeft + barWidth / 2, 6) // центр пилюли по x = центр бара
      const dist = flyDist({ height, pillH, barTop })
      expect(startTop + pillH / 2 - dist).toBeCloseTo(barTop + BAR_CORE_PX / 2, 6) // и по y
    }
  })
})
