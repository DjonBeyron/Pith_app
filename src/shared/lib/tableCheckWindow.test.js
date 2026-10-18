import { describe, it, expect } from 'vitest'
import { checkWindow } from './tableCheckWindow.js'

const cell = (id, start, end, extra = {}) => ({ id, cellId: id, visible: true, highlightOn: true, clips: [{ start, end }, { start: 0, end: 11 }], ...extra })

describe('checkWindow', () => {
  it('без проверки ничего не меняет', () => {
    expect(checkWindow([cell('a', 1, 2)], null, null).shifted).toBe(false)
  })
  it('метка после сборки остаётся как есть', () => {
    const r = checkWindow([cell('a', 1, 2)], 12, 13)
    expect(r).toEqual({ checkAt: 12, checkOut: 13, shifted: false })
  })
  it('метка на 0.7с раньше первой ячейки сдвигается за последнюю с тем же окном', () => {
    const r = checkWindow([cell('a', 1.47, 1.88), cell('b', 8.1, 8.44)], 0.7, 1)
    expect(r.shifted).toBe(true)
    expect(r.checkAt).toBeGreaterThan(8.44)
    expect(r.checkOut - r.checkAt).toBeCloseTo(0.3)
  })
  it('выключенная подсветка, галочка collect и скрытый слой не считаются', () => {
    const layers = [cell('a', 1, 2), cell('b', 9, 10, { highlightOn: false }), cell('c', 9, 10, { collect: false }), cell('d', 9, 10, { visible: false })]
    expect(checkWindow(layers, 3, 4).shifted).toBe(false)
  })
  it('клип до края композиции не утаскивает проверку за аудио', () => {
    const r = checkWindow([cell('a', 2, 11)], 0.7, 1)
    expect(r.checkAt).toBeLessThan(6)
  })
  it('перевёрнутый клип (конец раньше начала) игнорируется', () => {
    expect(checkWindow([cell('d', 27.91, 11)], 5, 6).shifted).toBe(false)
  })
})
