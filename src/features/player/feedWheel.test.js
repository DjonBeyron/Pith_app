import { describe, it, expect } from 'vitest'
import { wheelScrollShift } from './feedWheel.js'

describe('wheelScrollShift', () => {
  it('крутим колесо вниз — лента едет вниз (scrollTop уменьшается в перевёрнутом контейнере)', () => {
    expect(wheelScrollShift(100, 0, 600)).toBe(-100)
  })

  it('крутим вверх — знак обратный', () => {
    expect(wheelScrollShift(-100, 0, 600)).toBe(100)
  })

  it('строчный режим (Firefox) переводится в пиксели', () => {
    expect(wheelScrollShift(3, 1, 600)).toBe(-48)
  })

  it('постраничный режим — на высоту видимой области', () => {
    expect(wheelScrollShift(1, 2, 600)).toBe(-600)
  })

  it('высота неизвестна — постраничный режим не обнуляет прокрутку', () => {
    expect(wheelScrollShift(1, 2, 0)).toBe(-16)
  })
})
