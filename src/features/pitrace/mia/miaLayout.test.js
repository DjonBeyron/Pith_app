import { describe, it, expect } from 'vitest'
import { layoutOf, artMatrix, toScene, poseApply, poseSvg, poseOfMotion, miaCss, EYE_SPACING, MIA_W } from './miaLayout.js'
import { ART, createBox, flaps, shade, PAL } from './boxArt.js'

// образец с iPhone 12 mini: сцена 375×812, голова Пита 187,5×159,5 px у нижнего края
const cat = { stageW: 375, stageH: 812, catX: 93.8, catY: 658.9, catW: 187.5, catH: 159.5 }

describe('раскладка коробки на сцене', () => {
  it('глаза Пита: 53 % высоты головы, по центру; масштаб рисунка — глаза коробки на глазах Пита', () => {
    const L = layoutOf(cat, ART.PER_EYE)
    expect(L.f).toBeCloseTo(1, 5); expect(L.ex).toBeCloseTo(187.85, 0); expect(L.ey).toBeCloseTo(743.5, 0)
    expect(ART.PER_EYE * L.S).toBeCloseTo(EYE_SPACING * 187.5, 3)
    const M = artMatrix(L, ART.EYE_MID), p = toScene(M, ART.EYE_MID)
    expect(p[0]).toBeCloseTo(L.ex, 6); expect(p[1]).toBeCloseTo(L.ey, 6)
  })
  it('крупнее экран — крупнее и коробка (пропорционально голове)', () => {
    const L1 = layoutOf(cat, ART.PER_EYE), L2 = layoutOf({ ...cat, catW: 375, catH: 319 }, ART.PER_EYE)
    expect(L2.f).toBeCloseTo(2, 5); expect(L2.S / L1.S).toBeCloseTo(2, 5)
  })
  it('поза: нулевая — точка на месте; сдвиг и поворот вокруг опоры считаются верно', () => {
    const piv = [100, 200], id = { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1 }
    expect(poseApply(id, piv)([130, 150])).toEqual([130, 150])
    const q = poseApply({ dx: 10, dy: -5, rot: 90, sx: 1, sy: 1 }, piv)([110, 200])
    expect(q[0]).toBeCloseTo(110, 6); expect(q[1]).toBeCloseTo(205, 6) // (10,0) → поворот 90° = (0,10) → +опора (100,210) → сдвиг (10,-5) = (110, 205)
    expect(poseSvg(id, piv)).toContain('rotate(0.000)')
  })
  it('поза из движения: dx — в масштабе головы, dy — в высотах сцены × 1,3', () => {
    const L = layoutOf(cat, ART.PER_EYE), p = poseOfMotion({ dx: 10, dy: -1, rot: 2, sx: 1.1, sy: 0.9 }, L)
    expect(p).toEqual({ dx: 10, dy: -1 * 812 * 1.3, rot: 2, sx: 1.1, sy: 0.9 })
  })
  it('transform спрайта Мии: лапы в заданной точке', () => {
    const css = miaCss(200, 600, 1, 0, 1, 1)
    expect(css).toContain(`translate(${(200 - MIA_W / 2).toFixed(1)}px`); expect(css).toContain('rotate(0.00deg)')
  })
})

describe('рисунок коробки', () => {
  it('клапаны: плоские лежат на полу, задранные поднимаются выше', () => {
    const flat = flaps(0, 0), up = flaps(60, 60)
    expect(Math.min(...up.nearL.map(p => p[1]))).toBeLessThan(Math.min(...flat.nearL.map(p => p[1])) - 20)
    expect(flat.nearL).toHaveLength(4)
  })
  it('цвет — вариант 2 «оранжевый приглушённый»; shade затемняет', () => {
    expect(PAL).toMatchObject({ top: '#E3B67E', left: '#CD9A5E', right: '#B98649' }); expect(shade('#808080', 0.5)).toBe('#404040')
  })
  it('createBox строит группу один раз и update только меняет атрибуты (глаза, линии речи)', () => {
    const els = []
    const mk = tag => { const el = { tag, attrs: {}, kids: [], setAttribute(k, v) { this.attrs[k] = v }, appendChild(c) { this.kids.push(c) }, append(...c) { this.kids.push(...c) }, remove() {}, set innerHTML(v) { this.html = v } }; els.push(el); return el }
    globalThis.document = { createElementNS: (_, tag) => mk(tag) }
    try {
      const box = createBox('t')
      const n = els.length
      box.update({ thNear: 30, thFar: 20, open: 1, talk: 0.8, t: 1.0, look: 1, scale: 1 })
      box.update({ thNear: 0, thFar: 0, open: 0, talk: 0, t: 1.1 })
      expect(els.length).toBe(n)                                     // новых узлов не появилось
      const lines = els.filter(e => e.tag === 'line')
      expect(lines).toHaveLength(12)                                // 6 штрихов × (подложка + белый)
      expect(lines.every(l => Number(l.attrs.opacity) === 0)).toBe(true) // речь кончилась — линии погашены
    } finally { delete globalThis.document }
  })
})
