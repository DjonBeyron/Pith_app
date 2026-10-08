import { describe, it, expect } from 'vitest'
import { hitWordIndex, underlineBox, UNDERLINE_GAP } from './catchStripGeom.js'
import { REGION_PAD } from '../phraseBubbleRegions.js'

// Две строки: «Hello world» / «again»
const rects = [
  { index: 0, left: 10, top: 10, right: 50, bottom: 30 },
  { index: 1, left: 58, top: 10, right: 100, bottom: 30 },
  { index: 2, left: 10, top: 40, right: 60, bottom: 60 },
]

describe('hitWordIndex', () => {
  it('точное попадание в слово', () => {
    expect(hitWordIndex(rects, 20, 20)).toBe(0)
    expect(hitWordIndex(rects, 70, 15)).toBe(1)
    expect(hitWordIndex(rects, 30, 50)).toBe(2)
  })
  it('допуск по краям: чуть выше/ниже и сбоку от буквы — то же слово', () => {
    expect(hitWordIndex(rects, 52, 6)).toBe(0)
    expect(hitWordIndex(rects, 103, 33)).toBe(1)
  })
  it('тап в пробел между словами — ближайшее слово той же строки', () => {
    expect(hitWordIndex(rects, 54, 20, 2)).toBe(0)
    expect(hitWordIndex(rects, 56, 20, 1)).toBe(1)
  })
  it('правее последнего слова строки — оно же; мимо всех строк — null', () => {
    expect(hitWordIndex(rects, 300, 20)).toBe(1)
    expect(hitWordIndex(rects, 20, 200)).toBe(null)
    expect(hitWordIndex([], 20, 20)).toBe(null)
  })
})

describe('underlineBox', () => {
  it('координаты относительно обёртки, под низом слова, по ширине облачка (слово + запас с обеих сторон)', () => {
    const wrap = { left: 4, top: 100 }
    const span = { left: 58, top: 110, right: 100, bottom: 130 }
    expect(underlineBox(span, wrap)).toEqual({ x: 54 - REGION_PAD, y: 30 + UNDERLINE_GAP, w: 42 + REGION_PAD * 2 })
    expect(underlineBox(span, wrap, 0, 0)).toEqual({ x: 54, y: 30, w: 42 })
  })
})
