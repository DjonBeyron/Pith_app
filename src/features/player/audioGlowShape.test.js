import { describe, it, expect } from 'vitest'
import {
  bandShapes, glowContour, contourDelta, contourReach, innerX, innerY,
  POINTS, CANVAS_W, CANVAS_H, CSS_W, CSS_H, SCALE, SCREEN_CORNER_R as R, SIDE_TOP, BOTTOM_REACH, T_MAX, T_BASE, BASE_LEN,
  OX, OY, NX, NY, ARC_FIRST, ARC_LAST,
} from './audioGlowShape.js'
import { LAYERS, LAYER_COUNT, accumulatedAlpha } from './audioGlowLayers.js'

const bands = arr => Float32Array.from(arr)
const all = v => bands([v, v, v, v])
const px = c => Array.from(c, v => v * T_MAX)   // толщина в css px
// Точки дуги скругления: лежат на окружности радиуса R вокруг (R, R)
const arcIdx = () => [...Array(POINTS).keys()].filter(i => Math.abs(Math.hypot(OX[i] - R, OY[i] - R) - R) < 1e-3 && OX[i] <= R && OY[i] <= R)

describe('геометрия каймы по скруглению экрана', () => {
  it('размеры: canvas — SCALE от css, слой 96×150, вылеты в пределах слоя', () => {
    expect(CANVAS_W).toBe(CSS_W * SCALE)
    expect(CANVAS_H).toBe(CSS_H * SCALE)
    expect(SIDE_TOP).toBeLessThanOrEqual(CSS_H)
    expect(BOTTOM_REACH).toBeLessThanOrEqual(CSS_W)
    expect(R).toBeGreaterThanOrEqual(40)
    expect(R).toBeLessThanOrEqual(44)
    expect(T_MAX).toBeLessThan(R)           // внутренняя кривая не выворачивается
  })

  it('внешняя граница — кромка экрана: верх боковой полосы, дуга от боковой кромки до нижней, нижняя полоса', () => {
    expect([OX[0], OY[0]]).toEqual([0, SIDE_TOP])
    expect([OX[POINTS - 1], OY[POINTS - 1]]).toEqual([BOTTOM_REACH, 0])
    const arc = arcIdx()
    expect(arc.length).toBeGreaterThanOrEqual(8)
    // крайние точки дуги: на боковой кромке (0, R) и на нижней (R, 0)
    expect([OX[arc[0]], OY[arc[0]]]).toEqual([0, R])
    expect(OX[arc.at(-1)]).toBeCloseTo(R, 4)
    expect(OY[arc.at(-1)]).toBeCloseTo(0, 4)
    // до дуги — вертикаль на x=0, после — горизонталь на y=0
    for (let i = 0; i < arc[0]; i++) expect(OX[i]).toBe(0)
    for (let i = arc.at(-1) + 1; i < POINTS; i++) expect(OY[i]).toBe(0)
  })

  it('нормали единичные и смотрят внутрь экрана (к центру скругления)', () => {
    for (let i = 0; i < POINTS; i++) {
      expect(Math.hypot(NX[i], NY[i])).toBeCloseTo(1, 5)
      expect(NX[i]).toBeGreaterThanOrEqual(0)
      expect(NY[i]).toBeGreaterThanOrEqual(0)
    }
    for (const i of arcIdx()) {   // внутренняя точка дуги — на окружности меньшего радиуса R − t
      const t = 10
      const x = OX[i] + NX[i] * t, y = OY[i] + NY[i] * t
      expect(Math.hypot(x - R, y - R)).toBeCloseTo(R - t, 4)
    }
  })

  it('формы полос: низкие — ядро у угла, средняя — вылет вверх, высокая — верхушка и заход по низу', () => {
    const corner = bandShapes(1, 0.5), sideTop = bandShapes(0, 1), sideLow = bandShapes(0, 0.05), botEnd = bandShapes(2, 1)
    expect(corner[0]).toBeGreaterThan(sideTop[0] * 5)
    expect(sideTop[2]).toBeGreaterThan(sideLow[2] * 3)
    expect(sideTop[3]).toBeGreaterThan(sideLow[3] * 10)
    expect(botEnd[3]).toBeGreaterThan(0.5)
    for (const zone of [0, 1, 2]) for (let w = 0; w <= 1; w += 0.1) for (const v of bandShapes(zone, w)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1.0001) }
  })
})

describe('glowContour: базовая заполненная дуга на тихом звуке', () => {
  const reachOf = c => contourReach(c, 1)

  it('даже при нулевых полосах: вся дуга толщиной ≈ T_BASE и прямые участки ≈ BASE_LEN в обе стороны', () => {
    const c = glowContour(all(0), 1)
    for (const i of arcIdx()) expect(c[i] * T_MAX).toBeGreaterThanOrEqual(T_BASE * 0.99)
    const { up, inward } = reachOf(c)
    expect(up).toBeGreaterThanOrEqual(R + 15)
    expect(up).toBeLessThanOrEqual(R + BASE_LEN + 4)
    expect(inward).toBeGreaterThanOrEqual(R + 15)
    expect(inward).toBeLessThanOrEqual(R + BASE_LEN + 4)
  })

  it('у порога звука (полосы ≈ 0.1) — та же заполненная дуга без «лучиков»: толщина 7–12 px на всей дуге', () => {
    const c = glowContour(all(0.1), 0.5)
    for (const i of arcIdx()) { expect(c[i] * T_MAX).toBeGreaterThanOrEqual(7); expect(c[i] * T_MAX).toBeLessThanOrEqual(12) }
    const { up } = reachOf(c)
    expect(up).toBeLessThan(R + BASE_LEN + 15)
  })

  it('концы каймы сходят на нет: у верха боковой полосы и конца нижней толщина < 1 px', () => {
    for (const lvl of [0, 0.3, 1]) {
      const c = px(glowContour(all(lvl), 0))
      expect(c[0]).toBeLessThan(1)
      expect(c[POINTS - 1]).toBeLessThan(1)
    }
  })

  it('кайма гладкая: толщина соседних точек не скачет', () => {
    for (const b of [all(0), all(0.1), all(1), [1, 0.6, 0.9, 0.3], [0, 0, 0.3, 1], [1, 0, 0, 0]]) {
      const c = glowContour(bands(b), 0.7)
      for (let i = 1; i < POINTS; i++) expect(Math.abs(c[i] - c[i - 1])).toBeLessThan(0.33)
    }
  })
})

describe('glowContour: рост с уровнем', () => {
  it('толщина и вылет не убывают с уровнем (все полосы вместе)', () => {
    let prev = null
    for (const lvl of [0, 0.1, 0.25, 0.4, 0.6, 0.8, 1]) {
      const c = glowContour(all(lvl), 0)
      if (prev) {
        for (let i = 0; i < POINTS; i++) expect(c[i]).toBeGreaterThanOrEqual(prev.c[i] - 1e-6)
        const r = contourReach(c)
        expect(r.up).toBeGreaterThanOrEqual(prev.r.up - 1e-6)
        expect(r.inward).toBeGreaterThanOrEqual(prev.r.inward - 1e-6)
      }
      prev = { c, r: contourReach(c) }
    }
  })

  it('монотонность по каждой полосе отдельно', () => {
    for (let k = 0; k < 4; k++) {
      let prev = null
      for (const a of [0, 0.25, 0.5, 0.75, 1]) {
        const b = bands([0, 0, 0, 0]); b[k] = a
        const c = glowContour(b, 0)
        if (prev) for (let i = 0; i < POINTS; i++) expect(c[i]).toBeGreaterThanOrEqual(prev[i] - 1e-6)
        prev = c
      }
    }
  })

  it('громко: толщина у угла ≈ 36–38 px, вылет вверх ≈ 143, заход по низу ≈ 45–50 px за дугой', () => {
    const c = glowContour(all(1), 0)
    const corner = arcIdx()[4]
    expect(c[corner] * T_MAX).toBeGreaterThan(34)
    expect(c[corner] * T_MAX).toBeLessThanOrEqual(T_MAX + 1e-6)
    const { up, inward } = contourReach(c, 1)
    expect(up).toBeGreaterThan(125)
    expect(up).toBeLessThanOrEqual(SIDE_TOP)
    expect(inward - R).toBeGreaterThan(30)
    expect(inward - R).toBeLessThanOrEqual(BOTTOM_REACH - R)
  })

  it('громкий звук заметно больше тихого: толщина ×3, вылет вверх в разы', () => {
    const q = glowContour(all(0.1), 0), l = glowContour(all(1), 0)
    const i = arcIdx()[4]
    expect(l[i]).toBeGreaterThan(q[i] * 3)
    expect(contourReach(l).up).toBeGreaterThan(contourReach(q).up * 1.8)
  })

  it('внутренняя кайма не выходит за экран: внутренние точки дуги вне центра скругления', () => {
    const c = glowContour(all(1), 0)
    for (const i of arcIdx()) expect(Math.hypot(innerX(c, i) - R, innerY(c, i) - R)).toBeGreaterThan(R - T_MAX - 1e-6)
  })
})

describe('glowContour: форма по частотам', () => {
  it('низкие частоты — толщина у самого угла, средние — вылет вверх по боковой стороне, высокие — верхушка и заход по низу', () => {
    const low = glowContour(bands([1, 0.8, 0, 0]), 0)
    const mid = glowContour(bands([0, 0, 1, 0]), 0)
    const high = glowContour(bands([0, 0, 0, 1]), 0)
    const i = arcIdx()[4]
    expect(low[i]).toBeGreaterThan(mid[i] * 2)
    expect(contourReach(mid, 1).up).toBeGreaterThan(contourReach(low, 1).up + 20)
    expect(contourReach(high, 1).up).toBeGreaterThan(contourReach(low, 1).up)
    expect(contourReach(high, 1).inward).toBeGreaterThan(contourReach(mid, 1).inward)
  })

  it('симметрия: одна форма на оба угла (правый — зеркальная копия, рисует AudioGlow)', () => {
    const a = glowContour(bands([0.7, 0.5, 0.4, 0.2]), 2.2)
    const b = glowContour(bands([0.7, 0.5, 0.4, 0.2]), 2.2)
    expect(contourDelta(a, b)).toBe(0)
  })

  it('«дыхание» не меняет форму заметно (< порога перерисовки на тихом звуке)', () => {
    const a = glowContour(all(0.1), 0), b = glowContour(all(0.1), 1.37)
    expect(contourDelta(a, b)).toBeLessThan(0.05)
  })

  it('contourDelta — наибольший сдвиг', () => {
    const a = bands([0.1, 0.2, 0.3]), b = bands([0.1, 0.25, 0.1])
    expect(contourDelta(a, b)).toBeCloseTo(0.2, 5)
  })
})

describe('слои заливки: альфа от кромки внутрь', () => {
  it('у кромки экрана ≈ 0.90, у внутренней границы ≈ 0.05, монотонно убывает вглубь', () => {
    expect(accumulatedAlpha(0.001)).toBeCloseTo(0.90, 2)
    expect(accumulatedAlpha(0.99)).toBeCloseTo(0.05, 2)
    let prev = 1
    for (let d = 0.01; d < 1; d += 0.02) { const a = accumulatedAlpha(d); expect(a).toBeLessThanOrEqual(prev + 1e-9); prev = a }
  })

  it('слои: толщина от 1 до 0.1, у каждого своя малая альфа в (0, 1)', () => {
    expect(LAYERS).toHaveLength(LAYER_COUNT)
    expect(LAYERS[0].scale).toBe(1)
    expect(LAYERS.at(-1).scale).toBeCloseTo(1 / LAYER_COUNT, 5)
    for (const l of LAYERS) { expect(l.alpha).toBeGreaterThan(0); expect(l.alpha).toBeLessThan(1) }
  })
})

describe('внешняя граница заливается до прямого угла', () => {
  it('точки ARC_FIRST…ARC_LAST лежат на дуге скругления радиуса R с центром (R, R); остальные — на прямых кромках', () => {
    for (let i = 0; i < POINTS; i++) {
      const onArc = i >= ARC_FIRST && i <= ARC_LAST
      const d = Math.hypot(OX[i] - R, OY[i] - R)
      if (onArc) expect(Math.abs(d - R)).toBeLessThan(0.01)
      else expect(OX[i] === 0 || OY[i] === 0).toBe(true)   // боковая (x=0) или нижняя (y=0) кромка
    }
    expect(ARC_LAST - ARC_FIRST).toBeGreaterThan(3)
  })
})
