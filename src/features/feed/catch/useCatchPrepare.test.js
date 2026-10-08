import { describe, it, expect } from 'vitest'
import { coversPhrase, CATCH_PREPARE_DELAY_MS } from './useCatchPrepare.js'
import { CATCH_COLLAPSE_MS } from './catchTiming.js'

const rect = (left, top, right, bottom) => ({ left, top, right, bottom })

describe('подготовка фразы под накрытием', () => {
  const cover = rect(0, 400, 390, 640)

  it('подготовка начинается после сворачивания шторки (≥ 300мс)', () => {
    expect(CATCH_PREPARE_DELAY_MS).toBeGreaterThanOrEqual(300)
    expect(CATCH_PREPARE_DELAY_MS).toBeGreaterThanOrEqual(CATCH_COLLAPSE_MS)
  })

  it('накрытие закрывает блок фразы, если он целиком ниже его верха с запасом', () => {
    expect(coversPhrase(cover, rect(16, 500, 300, 580))).toBe(true)
  })

  it('не закрывает, если фраза выше верха накрытия или в запасе под скругление', () => {
    expect(coversPhrase(cover, rect(16, 380, 300, 460))).toBe(false)
    expect(coversPhrase(cover, rect(16, 410, 300, 460))).toBe(false)
  })

  it('не закрывает, если фраза ниже низа накрытия или вылезает по бокам', () => {
    expect(coversPhrase(cover, rect(16, 500, 300, 660))).toBe(false)
    expect(coversPhrase(cover, rect(2, 500, 300, 580))).toBe(false)
    expect(coversPhrase(cover, rect(16, 500, 385, 580))).toBe(false)
  })

  it('нет накрытия или блока — не закрывает', () => {
    expect(coversPhrase(null, rect(0, 0, 1, 1))).toBe(false)
    expect(coversPhrase(cover, null)).toBe(false)
  })
})
