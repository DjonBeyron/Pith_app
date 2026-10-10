import { describe, it, expect } from 'vitest'
import {
  RING_K, RING_OPACITY, RING_ATTACK_MS, RING_DECAY_MS, BREATH_BASE, BREATH_SWING, EQ_FADE_MS, CIRCLE_R, RING_R0, WAVE_MARGIN,
  NOISE_GATE, RESPONSE_GAMMA, RESPONSE_GAIN,
  ringScale, ringOpacity, ringFrame, clampRadius, breath, ringTarget, ringsStep, restRings, eqEnvelope, voiceResponse,
} from './sayRings.js'
import { createVoiceLevel } from './sayVoiceLevel.js'

// Клип волн 229 px высотой (внутренние края корпуса: −11 сверху, −12 снизу); центр круга стоит в середине области между низом подписи (26 px от верха тела) и низом корпуса:
// 11 + 122 = 133 px от верха клипа → до верхнего края 133, до нижнего (самого тесного) — ROOM = 96 px
const PANEL = { width: 375, height: 229, cx: 187.5, cy: 133 }
const ROOM = PANEL.height - PANEL.cy

describe('уровень → масштаб и прозрачность колец', () => {
  it('круг записи 97,75 px (85 × 1,15), обводка вокруг него — внешний край 61,09 px (SVG 108,8: радиус 51 + 2,125, ×1,15); кольца стартуют с края обводки; масштаб от 1,0 до ≈1,25–1,4, внешние кольца дальше; даже без клипа внешнее кольцо не выходит за ближайший (нижний) край клипа; уровень вне 0..1 обрезается', () => {
    expect(CIRCLE_R * 2).toBeCloseTo(97.75, 6)
    expect(CIRCLE_R).toBeCloseTo(85 * 1.15 / 2, 6)
    expect(RING_R0).toBeCloseTo((108.8 * 60 / 128 + 4.25 / 2) * 1.15, 1)          // внешний край обводки: радиус r=60 из viewBox 128 + половина толщины, ×1,15 в записи
    expect(RING_R0 - CIRCLE_R).toBeGreaterThan(10)                               // зазор круг ↔ обводка: волны внутрь него не заходят (кольцо при масштабе 1 лежит по краю обводки)
    expect(RING_R0 * (1 + Math.max(...RING_K))).toBeLessThanOrEqual(ROOM - WAVE_MARGIN) // самое дальнее кольцо (≈ 85 px) укладывается в панель даже без клипа (до низа 96 px)
    expect(ringScale(0, 0)).toBe(1)
    for (let i = 0; i < 3; i++) {
      expect(ringScale(1, i)).toBeGreaterThanOrEqual(1.25)
      expect(ringScale(1, i)).toBeLessThanOrEqual(1.4)
      expect(ringScale(1, i) * RING_R0 - RING_R0).toBeLessThanOrEqual(33 * 0.85) // выступ за внешний край обводки ≤ 28 px (прежние ≤ 33 × 0,85)
      expect(ringScale(1, i) * RING_R0).toBeLessThanOrEqual(ROOM)
      expect(ringScale(2, i)).toBe(ringScale(1, i))
      expect(ringScale(-1, i)).toBe(1)
    }
    expect(ringScale(1, 0)).toBeLessThan(ringScale(1, 1))
    expect(ringScale(1, 1)).toBeLessThan(ringScale(1, 2))
    expect(RING_K).toEqual([0.25, 0.32, 0.39])
    // выступы за обводку = прежние 18 / 23 / 28 px × 0,85 (визуальные пропорции прежние)
    RING_K.forEach((k, i) => expect(k * RING_R0).toBeCloseTo([18, 23, 28][i] * 0.85, 0))
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
    expect(clampRadius(500, PANEL)).toBe(ROOM - WAVE_MARGIN) // ближе всего нижний край (центр ниже середины панели): 96 − 2
    expect(clampRadius(94, PANEL)).toBe(94)
    expect(clampRadius(95, PANEL)).toBe(94)
  })

  it('узкая ширина 320–390 px: по бокам запас большой, предел задаёт высота; очень узкий контейнер режет по ширине', () => {
    for (const w of [320, 360, 375, 390]) {
      const box = { width: w - 32, height: 229, cx: (w - 32) / 2, cy: 133 }
      expect(clampRadius(94, box)).toBeLessThanOrEqual(box.cx)
      expect(clampRadius(500, box)).toBe(ROOM - WAVE_MARGIN) // предел задаёт нижний край: 96 − 2
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
    for (const box of [PANEL, { width: 288, height: 229, cx: 144, cy: 133 }, { width: 343, height: 140, cx: 171.5, cy: 70 }]) {
      const limit = clampRadius(1e9, box)
      for (let i = 0; i < 3; i++) {
        for (const lvl of [0, 0.5, 1, 7]) {
          const f = ringFrame(lvl, i, box)
          expect(f.scale * RING_R0).toBeLessThanOrEqual(Math.max(RING_R0, limit) + 1e-9)
          expect(f.scale).toBeGreaterThanOrEqual(1)
        }
      }
    }
    expect(ringFrame(1, 2, PANEL).scale).toBeCloseTo(ringScale(1, 2), 5) // 1,39 × 61,09 = 85: в большой панели клип ничего не режет
    const low = { width: 343, height: 140, cx: 171.5, cy: 70 }
    expect(ringFrame(1, 2, low).scale).toBeCloseTo(68 / RING_R0, 5)    // а в низком контейнере предел — расстояние до края минус запас
    expect(ringFrame(1, 0, null).scale).toBeCloseTo(ringScale(1, 0), 10)
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
    expect(ringTarget({ voice: 0.9, t: 0 })).toBe(voiceResponse(0.9))
    expect(ringTarget({ voice: 0, t: 450 })).toBe(breath(450))
    expect(ringTarget({ voice: 0.03, t: 0 })).toBe(breath(0)) // шум ниже порога — кольца только дышат
    expect(ringTarget({ voice: 1.7, t: 0 })).toBe(1)
  })
})

describe('отклик на голос (порог шума + степень < 1) — чувствительность эквалайзера', () => {
  it('константы: небольшой порог, степень < 1 (тихий голос поднимается), усиление ≥ 1; «ожидание» тише прежнего', () => {
    expect(NOISE_GATE).toBeGreaterThan(0)
    expect(NOISE_GATE).toBeLessThanOrEqual(0.08)
    expect(RESPONSE_GAMMA).toBeLessThan(1)
    expect(RESPONSE_GAIN).toBeGreaterThanOrEqual(1)
    expect(BREATH_BASE + BREATH_SWING).toBeLessThan(0.18)
  })

  it('тишина и шум ниже порога = 0 (кольца не дёргаются), монотонно растёт, обрезается до 0..1, мусор на входе безопасен', () => {
    for (const v of [0, 0.01, NOISE_GATE, -1, NaN, undefined, null]) expect(voiceResponse(v)).toBe(0)
    let prev = 0
    for (let v = NOISE_GATE + 0.001; v <= 1.0001; v += 0.01) {
      const r = voiceResponse(v)
      expect(r).toBeGreaterThanOrEqual(prev)
      expect(r).toBeLessThanOrEqual(1)
      prev = r
    }
    expect(voiceResponse(1)).toBe(1)
    expect(voiceResponse(7)).toBe(1)
  })

  it('кривая выпуклая: тихая речь (0,1) уже ≥ 0,3 — втрое выше «ожидания»; 0,2 ≥ 0,5; отклик выше исходного уровня на всём тихом диапазоне', () => {
    expect(voiceResponse(0.1)).toBeGreaterThanOrEqual(0.3)
    expect(voiceResponse(0.1)).toBeGreaterThanOrEqual((BREATH_BASE + BREATH_SWING) * 2)
    expect(voiceResponse(0.2)).toBeGreaterThanOrEqual(0.5)
    for (const v of [0.08, 0.1, 0.15, 0.2, 0.3, 0.5]) expect(voiceResponse(v)).toBeGreaterThan(v)
  })

  it('тихая речь заметно двигает внутреннее кольцо: радиус ≥ 2,5 px (3 × 0,85) выше, чем в тишине (при дыхании в пике)', () => {
    const silent = ringFrame(BREATH_BASE + BREATH_SWING, 0, PANEL).scale * RING_R0
    const quiet = ringFrame(voiceResponse(0.1), 0, PANEL).scale * RING_R0
    expect(quiet - silent).toBeGreaterThanOrEqual(2.5)
    expect(ringOpacity(voiceResponse(0.1), 0)).toBeGreaterThan(ringOpacity(BREATH_BASE, 0) * 1.4)
  })
})

describe('старт записи: кольца без «вспышки», проявляются плавно', () => {
  it('в кадре тапа кольца на уровне «дыхания» (restRings), без единого события распознавания; новый массив на каждый вызов', () => {
    const k = restRings()
    expect(k).toEqual([BREATH_BASE, BREATH_BASE, BREATH_BASE])
    expect(k[0]).toBeLessThanOrEqual(BREATH_BASE + BREATH_SWING)
    k[0] = 0
    expect(restRings()[0]).toBe(BREATH_BASE)
    expect(ringFrame(restRings()[0], 0, PANEL).scale).toBeLessThan(1.05) // вспышки (прежние ×1,125 в кадре тапа) нет
  })

  it('прозрачность растёт от нуля по smoothstep за EQ_FADE_MS: 0 в кадре тапа, 1 после, без скачка (≤ 0,06 за кадр 16 мс), ровный старт и финиш', () => {
    expect(EQ_FADE_MS).toBeGreaterThanOrEqual(400)
    expect(EQ_FADE_MS).toBeLessThanOrEqual(800)
    expect(eqEnvelope(0)).toBe(0)
    expect(eqEnvelope(-5)).toBe(0)
    expect(eqEnvelope(EQ_FADE_MS / 2)).toBeCloseTo(0.5, 10)
    expect(eqEnvelope(EQ_FADE_MS)).toBe(1)
    expect(eqEnvelope(EQ_FADE_MS * 5)).toBe(1)
    let prev = 0
    for (let t = 0; t <= EQ_FADE_MS + 64; t += 16) {
      const e = eqEnvelope(t)
      expect(e).toBeGreaterThanOrEqual(prev)
      expect(e - prev).toBeLessThanOrEqual(0.06)
      prev = e
    }
    expect(eqEnvelope(16)).toBeLessThan(0.01)                     // нулевая начальная скорость: первые кадры почти не видны
    expect(1 - eqEnvelope(EQ_FADE_MS - 16)).toBeLessThan(0.01)    // и плавный выход на единицу
  })

  it('env меняет только прозрачность кольца (масштаб не трогает); по умолчанию 1', () => {
    for (let i = 0; i < 3; i++) {
      const full = ringFrame(0.6, i, PANEL)
      const half = ringFrame(0.6, i, PANEL, 0.5)
      expect(half.scale).toBe(full.scale)
      expect(half.opacity).toBeCloseTo(full.opacity * 0.5, 10)
      expect(ringFrame(0.6, i, PANEL, 0).opacity).toBe(0)
      expect(ringFrame(0.6, i, PANEL, 1)).toEqual(full)
    }
  })

  it('кольца с уровня покоя не выбиваются из «дыхания»: дальше они лишь дышат (ringTarget)', () => {
    let l = restRings()
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
    let levels = restRings()
    for (let t = 0; t < 1000; t += 16) levels = ringsStep(levels, ringTarget({ voice: v.ringLevel(t), t }), 16)
    expect(levels[0]).toBeLessThan(0.3) // тишина: только ожидание
    v.signal('soundstart', 1000)
    levels = ringsStep(levels, ringTarget({ voice: v.ringLevel(1000), t: 1000 }), 16)
    expect(levels[0]).toBeGreaterThanOrEqual(0.5)
    expect(ringScale(levels[0], 0)).toBeGreaterThanOrEqual(1.12)
    for (let t = 1016; t < 1120; t += 16) levels = ringsStep(levels, ringTarget({ voice: v.ringLevel(t), t }), 16)
    expect(levels[2]).toBeGreaterThan(0.6)

    const w = createVoiceLevel()
    w.signal('audiostart', 0); w.signal('interim', 500)
    expect(ringsStep([0, 0, 0], ringTarget({ voice: w.ringLevel(500), t: 500 }), 16)[0]).toBeGreaterThan(0.5)
  })
})
