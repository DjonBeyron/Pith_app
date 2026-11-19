import { describe, it, expect } from 'vitest'
import { tailPose, tailPath, tailMarks, createTailDriver, KEYS, CALM } from './miaTailDrive.js'
import { MIA_TAIL } from './miaTailData.js'

const tipOf = p => [p.x.at(-1), p.y.at(-1)]
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

describe('движение хвоста Мии', () => {
  it('в целые u хвост проходит ровно через ключевую позу (кончик совпадает с данными)', () => {
    for (let k = 0; k < KEYS; k++) {
      const p = tailPose(k), q = MIA_TAIL[k].q
      expect(dist(tipOf(p), [q[94], q[95]]), `поза ${k + 1}`).toBeLessThan(0.05)
    }
  })
  it('цикл замкнут: u и u + 9 — одна поза; отрицательные u тоже', () => {
    const a = tailPose(2.37), b = tailPose(2.37 + KEYS), c = tailPose(2.37 - KEYS)
    expect(dist(tipOf(a), tipOf(b))).toBeLessThan(1e-6); expect(dist(tipOf(a), tipOf(c))).toBeLessThan(1e-6)
  })
  it('плавность: шаг u в 1/60 позы сдвигает кончик не больше чем на несколько единиц, скачков (в т. ч. на стыках поз и цикла) нет', () => {
    let prev = tipOf(tailPose(0)), worst = 0
    for (let u = 1 / 120; u <= KEYS + 0.5; u += 1 / 120) { const t = tipOf(tailPose(u)); worst = Math.max(worst, dist(prev, t)); prev = t }
    expect(worst).toBeLessThan(14) // единицы пака: ≈ 5 px экрана за 1/120 позы — быстрый взмах, но не прыжок
  })
  it('длина хвоста между позами не проваливается (поворот, а не сжатие)', () => {
    const len = p => p.th.length && p.x.reduce((s, _, i) => (i ? s + Math.hypot(p.x[i] - p.x[i - 1], p.y[i] - p.y[i - 1]) : 0), 0)
    const a = len(tailPose(3)), b = len(tailPose(4)), m = len(tailPose(3.5))
    expect(m).toBeGreaterThan(Math.min(a, b) * 0.9)
  })
  it('«довольна»: хвост идёт к поднятой позе, толще, но поза не одна и та же на любых u (не замирает)', () => {
    const calm = tailPose(CALM), a = tailPose(7, 1), b = tailPose(7, 0)
    expect(dist(tipOf(a), tipOf(calm))).toBeLessThan(dist(tipOf(b), tipOf(calm)))
    expect(a.w).toBeGreaterThan(b.w)
    expect(dist(tipOf(tailPose(1, 1)), tipOf(tailPose(6, 1)))).toBeGreaterThan(5)
  })
  it('контур: замкнутый путь без NaN; основание — внутри, кончик круглый', () => {
    for (const u of [0, 1.5, 4, 8.9]) { const d = tailPath(tailPose(u)); expect(d).toMatch(/^M[-\d. L]+Z$/); expect(d).not.toContain('NaN') }
  })
  it('штрихи: у поз 1 и 9 их нет; на позе 4 видны (opacity 1) и пропадают к стыку с соседней позой; «довольна» их скрывает', () => {
    expect(tailMarks(0, tailPose(0))).toHaveLength(0)
    const at4 = tailMarks(3, tailPose(3)); expect(at4.length).toBeGreaterThan(0); expect(at4[0].opacity).toBe(1)
    const edge = tailMarks(3.49, tailPose(3.49)); expect(edge[0].opacity).toBeLessThan(0.05)
    expect(tailMarks(3, tailPose(3, 1), 1)[0].opacity).toBe(0)
  })
  it('драйвер пишет d в узлы; на паузе (dt = 0) поза не меняется; reduced-motion — стоит', () => {
    const attrs = () => { const o = {}; return { setAttribute: (k, v) => { o[k] = v }, o } }
    const body = attrs(), mk = [attrs(), attrs(), attrs(), attrs()]
    const root = { querySelector: s => (s === '.mt-tail' ? body : null), querySelectorAll: () => mk }
    const dr = createTailDriver(root); dr.update(0.5, false); const d1 = body.o.d; dr.update(0, false); expect(body.o.d).toBe(d1); dr.update(0.1, false); expect(body.o.d).not.toBe(d1)
    const body2 = attrs(), root2 = { querySelector: () => body2, querySelectorAll: () => [] }; const r = createTailDriver(root2, { reduced: true }); r.update(1, false); const f1 = body2.o.d; r.update(1, false); expect(body2.o.d).toBe(f1)
  })
})
