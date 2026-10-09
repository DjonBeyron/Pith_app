import { describe, it, expect } from 'vitest'
import {
  RING_K, RING_OPACITY, RING_ATTACK_MS, RING_DECAY_MS, BREATH_BASE, BREATH_SWING, PREP_BREATH_K,
  ringScale, ringOpacity, breath, ringTarget, ringsStep, initialRings,
} from './sayRings.js'
import { createVoiceLevel } from './sayVoiceLevel.js'

describe('уровень → масштаб и прозрачность колец', () => {
  it('масштаб от 1,0 до ≈1,9–2,2 (амплитуда большая), внешние кольца дальше; уровень вне 0..1 обрезается', () => {
    expect(ringScale(0, 0)).toBe(1)
    for (let i = 0; i < 3; i++) {
      expect(ringScale(1, i)).toBeGreaterThanOrEqual(1.9)
      expect(ringScale(1, i)).toBeLessThanOrEqual(2.2)
      expect(ringScale(2, i)).toBe(ringScale(1, i))
      expect(ringScale(-1, i)).toBe(1)
    }
    expect(ringScale(1, 0)).toBeLessThan(ringScale(1, 1))
    expect(ringScale(1, 1)).toBeLessThan(ringScale(1, 2))
  })

  it('прозрачность при уровне 1 = 0,55 / 0,32 / 0,16: ближнее плотнее, каждое следующее тусклее; от уровня растёт', () => {
    expect(RING_OPACITY).toEqual([0.55, 0.32, 0.16])
    expect([0, 1, 2].map(i => ringOpacity(1, i))).toEqual([0.55, 0.32, 0.16])
    for (let i = 0; i < 3; i++) expect(ringOpacity(0, i)).toBeLessThan(ringOpacity(1, i))
    expect(ringOpacity(1, 0)).toBeGreaterThan(ringOpacity(1, 1))
    expect(ringOpacity(1, 1)).toBeGreaterThan(ringOpacity(1, 2))
  })

  it('CSS (say-phrase-mic.css) использует те же k и прозрачности', async () => {
    const { readFileSync } = await import('node:fs')
    const css = readFileSync(new URL('../../../styles/player/panels/say-phrase-mic.css', import.meta.url), 'utf8')
    const vars = ['--say-lvl', '--say-lvl2', '--say-lvl3']
    RING_K.forEach((k, i) => {
      const rule = css.match(new RegExp(`\\.sayRing${i + 1} \\{[^}]*\\}`))[0]
      expect(rule).toContain(`transform: scale(calc(1 + var(${vars[i]}, 0) * ${k}))`)
      expect(rule).toContain(`opacity: calc(${RING_OPACITY[i]} * (0.35 + 0.65 * var(${vars[i]}, 0)))`)
    })
  })
})

describe('«дыхание» и цель колец', () => {
  it('дыхание не выходит из BREATH_BASE ± BREATH_SWING и положительно (кольца живы без событий)', () => {
    for (let t = 0; t < 4000; t += 50) {
      const b = breath(t)
      expect(b).toBeGreaterThanOrEqual(BREATH_BASE - BREATH_SWING - 1e-9)
      expect(b).toBeLessThanOrEqual(BREATH_BASE + BREATH_SWING + 1e-9)
      expect(b).toBeGreaterThan(0)
    }
  })

  it('подготовка (до «Слушаю…») — только спокойное дыхание, голос игнорируется; слушаем — голос, но не ниже дыхания', () => {
    expect(ringTarget({ voice: 1, t: 0, listening: false })).toBeCloseTo(breath(0) * PREP_BREATH_K, 10)
    expect(ringTarget({ voice: 0.9, t: 0, listening: true })).toBe(0.9)
    expect(ringTarget({ voice: 0, t: 450, listening: true })).toBe(breath(450))
  })
})

describe('инерция колец', () => {
  it('внутреннее реагирует мгновенно, внешние с задержкой 40–90 мс и мягче затухают', () => {
    expect(RING_ATTACK_MS[0]).toBe(0)
    expect(RING_ATTACK_MS[1]).toBeGreaterThanOrEqual(40)
    expect(RING_ATTACK_MS[2]).toBeLessThanOrEqual(90)
    expect(RING_DECAY_MS[0]).toBeLessThan(RING_DECAY_MS[1])
    expect(RING_DECAY_MS[1]).toBeLessThan(RING_DECAY_MS[2])
    const up = ringsStep(initialRings(), 1, 16)
    expect(up[0]).toBe(1)
    expect(up[1]).toBeGreaterThan(0.2)
    expect(up[1]).toBeLessThan(up[0])
    expect(up[2]).toBeLessThan(up[1])
    const down = ringsStep([1, 1, 1], 0, 100)
    expect(down[0]).toBeLessThan(down[1])
    expect(down[1]).toBeLessThan(down[2])
  })

  it('сходится к цели, не выходит за 0..1, нулевой dt ничего не двигает (кроме мгновенного кольца)', () => {
    let l = initialRings()
    for (let i = 0; i < 60; i++) l = ringsStep(l, 0.8, 16)
    l.forEach(v => expect(v).toBeCloseTo(0.8, 2))
    expect(ringsStep([0.2, 0.2, 0.2], 0.9, 0).slice(1)).toEqual([0.2, 0.2])
  })
})

describe('конвейер: событие распознавания → кольца', () => {
  it('soundstart: внутреннее кольцо ≥ 0,5 в первый же кадр, остальные догоняют за ~100 мс; шёпот (один interim) тоже заметен', () => {
    const v = createVoiceLevel()
    v.signal('audiostart', 0)
    let levels = initialRings()
    for (let t = 0; t < 1000; t += 16) levels = ringsStep(levels, ringTarget({ voice: v.ringLevel(t), t, listening: true }), 16)
    const calm = levels[0]
    expect(calm).toBeLessThan(0.2)
    v.signal('soundstart', 1000)
    levels = ringsStep(levels, ringTarget({ voice: v.ringLevel(1000), t: 1000, listening: true }), 16)
    expect(levels[0]).toBeGreaterThanOrEqual(0.5)
    expect(ringScale(levels[0], 0)).toBeGreaterThanOrEqual(1.45)
    for (let t = 1016; t < 1120; t += 16) levels = ringsStep(levels, ringTarget({ voice: v.ringLevel(t), t, listening: true }), 16)
    expect(levels[2]).toBeGreaterThan(0.6)

    const w = createVoiceLevel()
    w.signal('audiostart', 0); w.signal('interim', 500)
    expect(ringsStep(initialRings(), ringTarget({ voice: w.ringLevel(500), t: 500, listening: true }), 16)[0]).toBeGreaterThan(0.5)
  })
})
