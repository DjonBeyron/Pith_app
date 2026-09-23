import { describe, it, expect } from 'vitest'
import { circleCycles, midSlide, pickSlideAfterRebuild, recentreTarget, moduleOf } from './feedCircle.js'

describe('круг ленты', () => {
  it('около 200 слайдов в круге, но не меньше 4 циклов', () => {
    expect(5 * circleCycles(5)).toBe(200)
    expect(circleCycles(100)).toBe(4) // большой список — всё равно есть запас
    expect(circleCycles(0)).toBe(0)
  })

  it('старт с середины, на первом модуле', () => {
    expect(midSlide(5, 40)).toBe(100)
    expect(moduleOf(midSlide(5, 40), 5)).toBe(0)
  })

  it('после пересборки остаётся на том же модуле, а не прыгает на первый', () => {
    // startedIds приезжают позже первого кадра и вырезают начатые модули
    const after = ['b', 'c', 'e'] // 'a' и 'd' оказались начатыми
    expect(pickSlideAfterRebuild(after, 'c', 3, circleCycles(3))).toBe(midSlide(3, circleCycles(3)) + 1)
  })

  it('модуль исчез из ленты или поворот из поиска — на начало', () => {
    const cycles = circleCycles(3)
    expect(pickSlideAfterRebuild(['b', 'c', 'e'], 'a', 3, cycles)).toBe(midSlide(3, cycles))
    expect(pickSlideAfterRebuild(['b', 'c', 'e'], null, 3, cycles)).toBe(midSlide(3, cycles))
  })

  it('у края запаса переносит в середину на тот же модуль, в середине — не трогает', () => {
    const len = 5, cycles = 40 // 200 слайдов
    expect(recentreTarget(100, len, cycles)).toBeNull()
    expect(recentreTarget(5, len, cycles)).toBeNull()
    expect(recentreTarget(4, len, cycles)).toBe(104) // модуль 4 остаётся модулем 4
    expect(recentreTarget(196, len, cycles)).toBe(101)
    expect(moduleOf(196, len)).toBe(moduleOf(101, len))
  })

  it('модуль слайда по кругу, в том числе для отрицательных', () => {
    expect(moduleOf(7, 5)).toBe(2)
    expect(moduleOf(-1, 5)).toBe(4)
    expect(moduleOf(3, 0)).toBe(0)
  })
})
