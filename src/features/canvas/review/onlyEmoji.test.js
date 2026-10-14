import { describe, it, expect } from 'vitest'
import { onlyEmoji } from './onlyEmoji.js'

describe('onlyEmoji', () => {
  it('текст отбрасывается, эмодзи остаются', () => {
    expect(onlyEmoji('Да))  ( смайл сон)')).toBe('')
    expect(onlyEmoji('🔥abc😴')).toBe('🔥😴')
    expect(onlyEmoji('👍🏽 ok')).toBe('👍🏽')
  })
})
