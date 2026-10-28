import { describe, it, expect } from 'vitest'
import kit from './kit.json'

// Усы «живого Пита v2» — четыре path с классами wh wh-l|wh-r wh-u|wh-d (каждый вращается вокруг корня у морды). Класс должен стоять
// на усах, а не на дужках очков: до v3.3.39 он по ошибке был на двух чёрных чёрточках по краям головы (M122.2 299.1H90.2M500.1 299.1H467.5).
// Усы — белые залитые штрихи по щекам: левые целиком левее середины морды (x < 296), правые — правее
describe('kit.json — усы', () => {
  const all = [...kit.head.matchAll(/<path class="(wh[^"]*)" d="([^"]+)"([^>]*)>/g)]
  it('четыре уса: по два слева и справа, верхний и нижний, белая заливка без обводки, один штрих в каждом', () => {
    expect(all).toHaveLength(4)
    const cls = all.map(m => m[1]).sort()
    expect(cls).toEqual(['wh wh-l wh-d', 'wh wh-l wh-u', 'wh wh-r wh-d', 'wh wh-r wh-u'])
    for (const [, c, d, attrs] of all) {
      expect(attrs).toContain('fill="#ffffff"')
      expect(attrs).not.toMatch(/stroke="/)
      expect((d.match(/M/g) || []).length).toBe(1)
      const xs = [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map(m => +m[1])
      if (c.includes('wh-l')) expect(Math.max(...xs)).toBeLessThan(296)
      else expect(Math.min(...xs)).toBeGreaterThan(296)
    }
  })
  it('дужки очков классом не помечены', () => {
    expect(kit.head).toContain('<path d="M122.2 299.1H90.2M500.1 299.1H467.5"')
  })
})
