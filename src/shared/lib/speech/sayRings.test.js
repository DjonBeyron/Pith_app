import { describe, it, expect } from 'vitest'
import {
  RING_K, RING_OPACITY, RING_ATTACK_MS, RING_DECAY_MS, BREATH_BASE, BREATH_SWING, TAP_KICK, CIRCLE_R, WAVE_MARGIN,
  ringScale, ringOpacity, ringFrame, clampRadius, breath, ringTarget, ringsStep, kickRings,
} from './sayRings.js'
import { createVoiceLevel } from './sayVoiceLevel.js'

// Панель ≈ 230 px высотой; центр круга в её середине → до верхнего/нижнего края ≈ 115 px
const PANEL = { width: 343, height: 230, cx: 171.5, cy: 115 }

describe('уровень → масштаб и прозрачность колец', () => {
  it('масштаб от 1,0 до ≈1,7–2,0, внешние кольца дальше; даже без клипа внешнее кольцо (радиус ≤ 113 px) не больше половины высоты панели; уровень вне 0..1 обрезается', () => {
    expect(ringScale(0, 0)).toBe(1)
    for (let i = 0; i < 3; i++) {
      expect(ringScale(1, i)).toBeGreaterThanOrEqual(1.7)
      expect(ringScale(1, i)).toBeLessThanOrEqual(2)
      expect(ringScale(1, i) * CIRCLE_R).toBeLessThanOrEqual(PANEL.height / 2)
      expect(ringScale(2, i)).toBe(ringScale(1, i))
      expect(ringScale(-1, i)).toBe(1)
    }
    expect(ringScale(1, 0)).toBeLessThan(ringScale(1, 1))
    expect(ringScale(1, 1)).toBeLessThan(ringScale(1, 2))
    expect(RING_K).toEqual([0.75, 0.85, 0.95])
  })

  it('прозрачность при уровне 1 = 0,55 / 0,32 / 0,16: ближнее плотнее, каждое следующее тусклее; от уровня растёт', () => {
    expect(RING_OPACITY).toEqual([0.55, 0.32, 0.16])
    expect([0, 1, 2].map(i => ringOpacity(1, i))).toEqual([0.55, 0.32, 0.16])
    for (let i = 0; i < 3; i++) expect(ringOpacity(0, i)).toBeLessThan(ringOpacity(1, i))
    expect(ringOpacity(1, 0)).toBeGreaterThan(ringOpacity(1, 1))
    expect(ringOpacity(1, 1)).toBeGreaterThan(ringOpacity(1, 2))
  })
})

describe('clampRadius — амплитуда волн не выходит за границы модуля (чистая функция)', () => {
  it('радиус обрезается по ближайшему краю контейнера минус запас; внутри контейнера не меняется', () => {
    expect(clampRadius(80, PANEL)).toBe(80)
    expect(clampRadius(500, PANEL)).toBe(PANEL.cy - WAVE_MARGIN) // верх/низ ближе боков: 115 − 2
    expect(clampRadius(113, PANEL)).toBe(113)
    expect(clampRadius(114, PANEL)).toBe(113)
  })

  it('узкая ширина 320–390 px: по бокам запас большой, предел задаёт высота; очень узкий контейнер режет по ширине', () => {
    for (const w of [320, 360, 375, 390]) {
      const box = { width: w - 32, height: 230, cx: (w - 32) / 2, cy: 115 }
      expect(clampRadius(113, box)).toBeLessThanOrEqual(box.cx)
      expect(clampRadius(500, box)).toBe(113)
    }
    expect(clampRadius(113, { width: 150, height: 230, cx: 75, cy: 115 })).toBe(75 - WAVE_MARGIN)
  })

  it('панель небольшая по высоте или центр смещён: режет по ближайшему краю (в том числе сверху)', () => {
    expect(clampRadius(113, { width: 343, height: 140, cx: 171.5, cy: 70 })).toBe(68)
    expect(clampRadius(113, { width: 343, height: 230, cx: 171.5, cy: 90 })).toBe(88)   // центр ближе к верху
    expect(clampRadius(113, { width: 343, height: 230, cx: 40, cy: 115 })).toBe(38)     // и к левому краю
  })

  it('нет размеров (контейнер ещё не измерен / нет DOM) — радиус как есть; отрицательный запас не даёт отрицательного радиуса', () => {
    expect(clampRadius(99, null)).toBe(99)
    expect(clampRadius(99, { width: 0, height: 0 })).toBe(99)
    expect(clampRadius(99, { width: 3, height: 3, cx: 1, cy: 1 })).toBe(0)
  })

  it('ringFrame: масштаб не превышает предел контейнера ни при каком уровне, не меньше 1 (круг не сжимается); без контейнера — обычный ringScale', () => {
    for (const box of [PANEL, { width: 288, height: 230, cx: 144, cy: 115 }, { width: 343, height: 140, cx: 171.5, cy: 70 }]) {
      const limit = clampRadius(1e9, box)
      for (let i = 0; i < 3; i++) {
        for (const lvl of [0, 0.5, 1, 7]) {
          const f = ringFrame(lvl, i, box)
          expect(f.scale * CIRCLE_R).toBeLessThanOrEqual(Math.max(CIRCLE_R, limit) + 1e-9)
          expect(f.scale).toBeGreaterThanOrEqual(1)
        }
      }
    }
    expect(ringFrame(1, 2, PANEL).scale).toBeCloseTo(113 / CIRCLE_R, 5) // 1,95 × 58 = 113,1 → обрезано до 113
    expect(ringFrame(1, 0, null).scale).toBe(ringScale(1, 0))
    expect(ringFrame(0.5, 1, null).opacity).toBe(ringOpacity(0.5, 1))
  })
})

describe('«ожидание» и цель колец', () => {
  it('ожидание не выходит из BREATH_BASE ± BREATH_SWING и положительно (волны живы без событий распознавания)', () => {
    for (let t = 0; t < 4000; t += 50) {
      const b = breath(t)
      expect(b).toBeGreaterThanOrEqual(BREATH_BASE - BREATH_SWING - 1e-9)
      expect(b).toBeLessThanOrEqual(BREATH_BASE + BREATH_SWING + 1e-9)
      expect(b).toBeGreaterThan(0)
    }
  })

  it('цель = голос, но не ниже ожидания; ГОЛОС учитывается с первого кадра записи (раньше до «Слушаю» его игнорировали)', () => {
    expect(ringTarget({ voice: 0.9, t: 0 })).toBe(0.9)
    expect(ringTarget({ voice: 0, t: 450 })).toBe(breath(450))
    expect(ringTarget({ voice: 0.05, t: 0 })).toBe(breath(0))
    expect(ringTarget({ voice: 1.7, t: 0 })).toBe(1)
  })
})

describe('мгновенный отклик на тап', () => {
  it('в кадре тапа кольца уже подняты (kickRings), без единого события распознавания; значения не общий массив и убывают наружу', () => {
    const k = kickRings()
    expect(k).toEqual(TAP_KICK)
    expect(k[0]).toBeGreaterThan(breath(0))
    expect(k[0]).toBeGreaterThan(k[1])
    expect(k[1]).toBeGreaterThan(k[2])
    k[0] = 0
    expect(kickRings()[0]).toBe(TAP_KICK[0])
    expect(ringFrame(kickRings()[0], 0, PANEL).scale).toBeGreaterThan(1.3)
  })

  it('вспышка оседает до ожидания за 100–300 мс, дальше кольца «дышат»', () => {
    let l = kickRings()
    for (let t = 0; t < 500; t += 16) l = ringsStep(l, ringTarget({ voice: 0, t }), 16)
    l.forEach(v => expect(v).toBeLessThan(BREATH_BASE + BREATH_SWING + 0.05))
    l.forEach(v => expect(v).toBeGreaterThan(BREATH_BASE - BREATH_SWING - 0.05))
  })
})

describe('инерция колец', () => {
  it('внутреннее реагирует мгновенно, внешние отстают лишь на 1–2 кадра и мягче затухают', () => {
    expect(RING_ATTACK_MS[0]).toBe(0)
    expect(RING_ATTACK_MS[1]).toBeLessThanOrEqual(20)
    expect(RING_ATTACK_MS[2]).toBeLessThanOrEqual(35)
    expect(RING_DECAY_MS[0]).toBeLessThan(RING_DECAY_MS[1])
    expect(RING_DECAY_MS[1]).toBeLessThan(RING_DECAY_MS[2])
    const up = ringsStep([0, 0, 0], 1, 16)
    expect(up[0]).toBe(1)
    expect(up[1]).toBeGreaterThan(0.5)
    expect(up[1]).toBeLessThan(up[0])
    expect(up[2]).toBeLessThan(up[1])
    const down = ringsStep([1, 1, 1], 0, 100)
    expect(down[0]).toBeLessThan(down[1])
    expect(down[1]).toBeLessThan(down[2])
  })

  it('сходится к цели, не выходит за 0..1, нулевой dt ничего не двигает (кроме мгновенного кольца)', () => {
    let l = [0, 0, 0]
    for (let i = 0; i < 60; i++) l = ringsStep(l, 0.8, 16)
    l.forEach(v => expect(v).toBeCloseTo(0.8, 2))
    expect(ringsStep([0.2, 0.2, 0.2], 0.9, 0).slice(1)).toEqual([0.2, 0.2])
  })
})

describe('реальный уровень: кольца без задержки', () => {
  it('скачок уровня 0 → 0,9: внутреннее кольцо в тот же кадр, остальные за 2 кадра (32 мс) уже ≥ 55% цели', () => {
    let l = ringsStep([0, 0, 0], 0.9, 16)
    expect(l[0]).toBeCloseTo(0.9, 10)
    l = ringsStep(l, 0.9, 16)
    expect(l[1]).toBeGreaterThan(0.9 * 0.55)
    expect(l[2]).toBeGreaterThan(0.9 * 0.55)
  })
})

describe('конвейер: событие распознавания → кольца', () => {
  it('soundstart: внутреннее кольцо ≥ 0,5 в первый же кадр, остальные догоняют за ~100 мс; шёпот (один interim) тоже заметен', () => {
    const v = createVoiceLevel()
    v.signal('audiostart', 0)
    let levels = kickRings()
    for (let t = 0; t < 1000; t += 16) levels = ringsStep(levels, ringTarget({ voice: v.ringLevel(t), t }), 16)
    expect(levels[0]).toBeLessThan(0.3) // тишина: только ожидание
    v.signal('soundstart', 1000)
    levels = ringsStep(levels, ringTarget({ voice: v.ringLevel(1000), t: 1000 }), 16)
    expect(levels[0]).toBeGreaterThanOrEqual(0.5)
    expect(ringScale(levels[0], 0)).toBeGreaterThanOrEqual(1.45)
    for (let t = 1016; t < 1120; t += 16) levels = ringsStep(levels, ringTarget({ voice: v.ringLevel(t), t }), 16)
    expect(levels[2]).toBeGreaterThan(0.6)

    const w = createVoiceLevel()
    w.signal('audiostart', 0); w.signal('interim', 500)
    expect(ringsStep([0, 0, 0], ringTarget({ voice: w.ringLevel(500), t: 500 }), 16)[0]).toBeGreaterThan(0.5)
  })
})
