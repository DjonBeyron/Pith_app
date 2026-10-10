import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Покадровая гладкость заливки круга (пункт 9): кривые берутся из CSS (say-phrase-state.css), считаются как в браузере (cubic-bezier), шаг — кадр 60 fps.
// Размеры — круг 85 px: радиус диска заливки 41,8 px (inset −1 от внутреннего края), значок 39 px (дальняя точка капсулы/дужки ≈ 20 px от центра).
const css = readFileSync(fileURLToPath(new URL('../../../../styles/player/panels/say-phrase-state.css', import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const [x1, y1, x2, y2] = css.match(/--say-ease: cubic-bezier\(([^)]*)\)/)[1].split(',').map(Number)
const T = Number(css.match(/--say-fill-t: ([\d.]+)s/)[1])
const ICON_T = Number(css.match(/--say-icon-t: ([\d.]+)s/)[1])
const DISC_R = 41.8, CIRCLE_R = 42.5, GLYPH_R = 20.1, FRAME = 1000 / 60

// cubic-bezier(x1, y1, x2, y2): прогресс по доле времени (метод бисекции по x)
function bezier(a, b, c, d) {
  const cx = 3 * a, bx = 3 * (c - a) - cx, ax = 1 - cx - bx
  const cy = 3 * b, by = 3 * (d - b) - cy, ay = 1 - cy - by
  const X = t => ((ax * t + bx) * t + cx) * t
  const Y = t => ((ay * t + by) * t + cy) * t
  return x => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let lo = 0, hi = 1, t = x
    for (let i = 0; i < 50; i++) { if (X(t) < x) lo = t; else hi = t; t = (lo + hi) / 2 }
    return Y(t)
  }
}
const fill = bezier(x1, y1, x2, y2)                       // заливка и рост круга идут по ОДНОЙ кривой
const progress = ms => fill(Math.min(1, ms / 1000 / T))
const maxStep = (from, to, f) => { let m = 0; for (let t = from + FRAME; t <= to + FRAME / 2; t += FRAME) m = Math.max(m, Math.abs(f(t) - f(t - FRAME))); return m }

describe('заливка круга: покадровая гладкость (60 fps)', () => {
  it('старт мягкий: за первые 50 мс заливка ≤ 1,5 % пути (старая кривая — 12 %), первый кадр ≤ 0,1 px радиуса диска', () => {
    expect(progress(50)).toBeLessThanOrEqual(0.015)
    expect(progress(FRAME) * DISC_R).toBeLessThanOrEqual(0.1)
    expect(progress(100)).toBeLessThanOrEqual(0.05)
  })

  it('максимальный шаг за кадр: радиус диска ≤ 1,5 px (старая кривая — 2,1 px с первого кадра), покрытие лаймом ≤ 4,5 % площади за кадр; нигде нет скачка', () => {
    expect(maxStep(0, T * 1000, ms => progress(ms) * DISC_R)).toBeLessThanOrEqual(1.5)
    const cover = ms => 1 - (1 - progress(ms)) ** 2
    expect(maxStep(0, T * 1000, cover)).toBeLessThanOrEqual(0.045)
    // скорость растёт плавно: шаг соседних кадров в начале (первые 8 кадров) никогда не вырастает больше чем вдвое + 0,05 px
    const steps = Array.from({ length: 8 }, (_, i) => (progress((i + 1) * FRAME) - progress(i * FRAME)) * DISC_R)
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThanOrEqual(steps[i - 1] * 2 + 0.05)
  })

  it('рост круга ×1,15 идёт по той же кривой и длительности: шаг ≤ 0,4 px радиуса за кадр, в точках 0/50/100/150/250/400/600/800 мс заливка и рост совпадают', () => {
    expect(css).toMatch(/--size-in: var\(--say-fill-t\) var\(--say-ease\)/)
    expect(maxStep(0, T * 1000, ms => progress(ms) * 0.15 * CIRCLE_R)).toBeLessThanOrEqual(0.4)
    const pts = [0, 50, 100, 150, 250, 400, 600, 800].map(ms => progress(ms))
    for (let i = 1; i < pts.length; i++) expect(pts[i]).toBeGreaterThanOrEqual(pts[i - 1]) // монотонно, без отката
    expect(pts[pts.length - 1]).toBeGreaterThan(0.97)                                      // к 800 мс почти залито
  })

  it('значок: к моменту, когда лайм доходит до его краёв, уже нулевой; ни в один кадр лайм не касается значка (радиус диска ≥ размер значка × радиус глифа)', () => {
    const zeroAt = 0.33 * ICON_T * 1000
    const reach = (() => { let t = 0; while (DISC_R * (1 - progress(t)) > GLYPH_R && t < T * 1000) t += 1; return t })() // когда диск сжался до края значка
    expect(zeroAt).toBeLessThanOrEqual(reach)
    const ease = bezier(0.45, 0, 0.55, 1)
    const iconScale = ms => 1 - ease(Math.min(1, ms / zeroAt))
    for (let t = 0; t <= T * 1000; t += FRAME) expect(GLYPH_R * iconScale(t)).toBeLessThanOrEqual(Math.max(DISC_R * (1 - progress(t)), 0.001) + 1e-9) // значок целиком внутри тёмного диска
    expect(maxStep(0, zeroAt, ms => iconScale(ms) * 39)).toBeLessThanOrEqual(3.2) // схлопывание без «щелчка»: ≤ 3,2 px размера значка за кадр
  })
})
