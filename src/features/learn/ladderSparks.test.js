import { describe, it, expect } from 'vitest'
import { tearSparks, boltPath, starPath, arcPath, noise } from './ladderSparks.js'

const nums = d => d.split(' ').map(Number).filter(v => !Number.isNaN(v))
const pts = d => { const n = nums(d); return Array.from({ length: n.length / 2 }, (_, i) => [n[2 * i], n[2 * i + 1]]) }
const len = d => pts(d).slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts(d)[i][0], p[1] - pts(d)[i][1]), 0)

describe('ladderSparks — искрение на концах разрыва', () => {
  const sp = tearSparks(90, 36, 178)

  it('детерминированно: шум и формы одинаковы между вызовами, без NaN', () => {
    expect(noise(3, 7)).toBe(noise(3, 7))
    expect(noise(3, 7)).not.toBe(noise(3, 8))
    expect(tearSparks(90, 36, 178)).toEqual(sp)
    const all = [...sp.bolts.map(b => b.d), ...sp.stars.map(s => s.d), sp.arc.d]
    for (const d of all) expect(d).not.toMatch(/NaN/)
    for (const f of sp.flies) expect(Object.values(f).every(v => Number.isFinite(v))).toBe(true)
  })

  it('разряд — короткий зигзаг из 4–5 сегментов от точки в сторону разрыва', () => {
    for (const [i, b] of sp.bolts.entries()) {
      const p = pts(b.d)
      expect(p.length).toBeGreaterThanOrEqual(5)
      expect(p.length).toBeLessThanOrEqual(6)
      expect(len(b.d)).toBeGreaterThan(9)
      expect(len(b.d)).toBeLessThan(23)
      const dir = i < 2 ? -1 : 1 // правый конец — влево, левый — вправо
      expect(Math.sign(p.at(-1)[0] - p[0][0])).toBe(dir)
    }
    // формы у всех четырёх разные
    expect(new Set(sp.bolts.map(b => b.d)).size).toBe(4)
    expect(boltPath(0, 0, 1, 1)).not.toBe(boltPath(0, 0, 1, 2))
  })

  it('звёздочка — 4 лучика по 2–3 px из кончика', () => {
    for (const s of sp.stars) {
      const segs = s.d.split('M ').filter(Boolean)
      expect(segs).toHaveLength(4)
      for (const seg of segs) {
        const [a, b] = pts(`M ${seg}`)
        const L = Math.hypot(b[0] - a[0], b[1] - a[1])
        expect(L).toBeGreaterThanOrEqual(1.9)
        expect(L).toBeLessThanOrEqual(3.1)
      }
    }
    expect(starPath(5, 5, 1)).not.toBe(starPath(5, 5, 2))
  })

  it('летящие искорки — по три на конец, отлетают на 6–12 px, в сторону разрыва', () => {
    for (const [i, f] of sp.flies.entries()) {
      const R = Math.hypot(f.tx, f.ty)
      expect(R).toBeGreaterThanOrEqual(5.9)
      expect(R).toBeLessThanOrEqual(12.1)
      expect(Math.sign(f.tx)).toBe(i < 3 ? -1 : 1)
      // точка излома — примерно на полпути, в стороне от прямой
      expect(Math.hypot(f.mx, f.my)).toBeLessThan(R)
    }
  })

  it('дуга через разрыв — зигзаг от правого конца к левому, дрожание ≤ 2 px', () => {
    const p = pts(sp.arc.d)
    expect(p[0]).toEqual([90, 178])
    expect(p.at(-1)).toEqual([36, 178])
    expect(p.length).toBeGreaterThanOrEqual(8)
    for (const q of p) expect(Math.abs(q[1] - 178)).toBeLessThanOrEqual(2)
    expect(arcPath(90, 36, 178, 1)).not.toBe(arcPath(90, 36, 178, 2))
  })

  it('тайминги: периоды и сдвиги у всех элементов свои (не совпадают)', () => {
    const items = [...sp.bolts, ...sp.flies, sp.arc]
    expect(new Set(items.map(i => i.period)).size).toBe(items.length)
    expect(new Set(items.map(i => i.delay)).size).toBe(items.length)
    // звёздочка вспыхивает вместе с первым разрядом своего конца
    expect(sp.stars[0].period).toBe(sp.bolts[0].period)
    expect(sp.stars[1].period).toBe(sp.bolts[2].period)
    expect(sp.bolts.map(b => b.kind)).toEqual(['A', 'B', 'B', 'A'])
  })
})
