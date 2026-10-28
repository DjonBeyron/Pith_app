import { describe, it, expect } from 'vitest'
import kit from './kit.json'

// Класс wh («живой Пит v2», усы при речи) должен стоять на усах, а не на дужках очков: до v3.3.39 он по ошибке был на двух чёрных
// чёрточках по краям головы (M122.2 299.1H90.2M500.1 299.1H467.5), и при речи ходили они. Усы — белый залитый контур из четырёх штрихов по щекам
describe('kit.json — усы', () => {
  it('ровно один контур с классом wh: белая заливка без обводки, четыре штриха, по обе стороны головы', () => {
    const all = [...kit.head.matchAll(/<path class="wh"([^>]*)>/g)]
    expect(all).toHaveLength(1)
    const a = all[0][1]
    expect(a).toContain('fill="#ffffff"')
    expect(a).not.toMatch(/stroke="/)
    const d = /d="([^"]+)"/.exec(a)[1]
    expect((d.match(/M/g) || []).length).toBe(4)
    const xs = [...d.matchAll(/M(-?[\d.]+) /g)].map(m => +m[1])
    expect(Math.min(...xs)).toBeLessThan(200)
    expect(Math.max(...xs)).toBeGreaterThan(400)
  })
  it('дужки очков классом не помечены', () => {
    expect(kit.head).toContain('<path d="M122.2 299.1H90.2M500.1 299.1H467.5"')
  })
})
