import { describe, it, expect } from 'vitest'
import { computeMounted, ENTER_MARGIN, STAY_MARGIN } from './useVisibleNodes.js'

const node = (id, x, y, size = 'mini') => ({ id, x, y, size, type: 'text', triggers: [] })
const view = { offset: { x: 0, y: 0 }, scale: 1, vw: 1000, vh: 800 }
const none = new Set()

describe('computeMounted: виртуализация холста', () => {
  it('в кадре и рядом — в DOM, далеко — нет', () => {
    const nodes = [node('a', 100, 100), node('b', 1400, 100), node('c', 9000, 100), node('d', 100, 9000)]
    const ids = computeMounted(nodes, view, none, none)
    expect([...ids].sort()).toEqual(['a', 'b'])
  })

  it('учитывает сдвиг и масштаб: дальний зум видит больше', () => {
    const nodes = [node('a', 100, 100), node('b', 3000, 100)]
    expect(computeMounted(nodes, view, none, none).has('b')).toBe(false)
    expect(computeMounted(nodes, { ...view, scale: 0.2 }, none, none).has('b')).toBe(true)
    expect(computeMounted(nodes, { ...view, offset: { x: -3000, y: 0 } }, none, none).has('b')).toBe(true)
  })

  it('гистерезис: вошедшая нода остаётся, пока не отъехала дальше STAY_MARGIN', () => {
    const edge = 1000 + 1000 * (ENTER_MARGIN + STAY_MARGIN) / 2 // между порогами входа и ухода
    const nodes = [node('a', edge, 100)]
    expect(computeMounted(nodes, view, none, none).has('a')).toBe(false)
    expect(computeMounted(nodes, view, new Set(['a']), none).has('a')).toBe(true)
    const far = [node('a', 1000 + 1000 * STAY_MARGIN + 50, 100)]
    expect(computeMounted(far, view, new Set(['a']), none).has('a')).toBe(false)
  })

  it('keep (выбранные, под курсором) остаются даже вне кадра', () => {
    const nodes = [node('a', 9000, 9000)]
    expect(computeMounted(nodes, view, none, new Set(['a'])).has('a')).toBe(true)
  })

  it('высокая max-нода с верхом над кадром, но телом в кадре — в DOM', () => {
    const tall = { ...node('t', 100, -3000, 'max'), triggers: [{}, {}] }
    const measures = { t: [100, 3200] } // замеренная нижняя строка «Тогда» в кадре
    expect(computeMounted([tall], view, none, none, measures).has('t')).toBe(true)
    expect(computeMounted([tall], view, none, none, {}).has('t')).toBe(false) // без замера — по CSS-оценке, она короткая
  })

  it('пустой урок и точно в границе кадра', () => {
    expect(computeMounted([], view, none, none).size).toBe(0)
    expect(computeMounted([node('a', 0, 0)], view, none, none).has('a')).toBe(true)
  })
})
