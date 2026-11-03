import { describe, it, expect } from 'vitest'
import { inWindow, creditWord, expiredPills, isStuck, CATCH_WINDOW_MS, SHADOW_WINDOW_MS, HEARD_LAG_MS, STUCK_MS } from './game2Hits.js'

const pills = [
  { i: 1, text: 'trying', startMs: 2000, endMs: 2500 },
  { i: 3, text: 'learn', startMs: 3500, endMs: 4000 },
  { i: 4, text: 'learn', startMs: 6000, endMs: 6400 },
]

describe('окна попадания', () => {
  it('константы из задания: «Ловлю» ±0,8 с, «Тень» ±1 с, поправка на Vosk 200 мс, застрял — 3 с', () => {
    expect([CATCH_WINDOW_MS, SHADOW_WINDOW_MS, HEARD_LAG_MS, STUCK_MS]).toEqual([800, 1000, 200, 3000])
  })
  it('окно — вокруг интервала слова', () => {
    expect(inWindow(pills[0], 1200, 800)).toBe(true)
    expect(inWindow(pills[0], 1199, 800)).toBe(false)
    expect(inWindow(pills[0], 3300, 800)).toBe(true)
    expect(inWindow(pills[0], 3301, 800)).toBe(false)
  })
  it('слово приписывается своей пилюле, если момент в окне; чужое слово и не своё время не засчитываются', () => {
    const f = new Set()
    expect(creditWord(pills, f, 'trying', 2300, 800)).toBe(1)
    expect(creditWord(pills, f, 'Learn', 3400, 800)).toBe(3)
    expect(creditWord(pills, f, 'learn', 1000, 800)).toBe(-1) // слишком рано для обеих
    expect(creditWord(pills, f, 'banana', 2300, 800)).toBe(-1)
  })
  it('одно слово дважды: сначала ранней пилюле, потом следующей; залитая второй раз не засчитывается', () => {
    const f = new Set([3])
    expect(creditWord(pills, f, 'learn', 3600, 800)).toBe(-1) // ранняя залита, вторая ещё далеко
    expect(creditWord(pills, f, 'learn', 5500, 800)).toBe(4)
  })
  it('«прошло окно» — пилюля не поймана; отмеченные и залитые не повторяются', () => {
    expect(expiredPills(pills, new Set(), new Set(), 3300, 800)).toEqual([]) // 2500 + 800 = 3300 — ещё в окне
    expect(expiredPills(pills, new Set(), new Set(), 3301, 800).map(p => p.i)).toEqual([1])
    expect(expiredPills(pills, new Set([1]), new Set(), 3301, 800)).toEqual([])
    expect(expiredPills(pills, new Set(), new Set([1]), 3301, 800)).toEqual([])
  })
  it('застрял: нет ни одного слова за 3 с от первого слова, подсказка один раз', () => {
    expect(isStuck({ t: 4999, firstStartMs: 2000 })).toBe(false)
    expect(isStuck({ t: 5000, firstStartMs: 2000 })).toBe(true)
    expect(isStuck({ t: 9000, firstStartMs: 2000, credited: 1 })).toBe(false)
    expect(isStuck({ t: 9000, firstStartMs: 2000, hinted: true })).toBe(false)
  })
})
