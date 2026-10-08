import { describe, it, expect } from 'vitest'
import { phraseSurface } from './phraseSurface.js'

describe('phraseSurface', () => {
  it('обычный слайд: спойлер до тапа', () => {
    expect(phraseSurface({ ctActive: false, revealed: false })).toBe('spoiler')
  })
  it('регрессия v3.2.1873: после тапа (revealed) спойлер остаётся смонтированным и доигрывает взрыв', () => {
    expect(phraseSurface({ ctActive: false, revealed: true })).toBe('spoiler')
  })
  it('ловля слов: чип, пока фраза закрыта, и обычная фраза после «Готово»', () => {
    expect(phraseSurface({ ctActive: true, revealed: false })).toBe('chip')
    expect(phraseSurface({ ctActive: true, revealed: true })).toBe('plain')
  })
})
