import { describe, it, expect } from 'vitest'
import { isRewardOn } from './nodeReward.js'

describe('isRewardOn', () => {
  it('обычные типы — награда включена по умолчанию', () => {
    expect(isRewardOn('word_choice', {})).toBe(true)
    expect(isRewardOn('phrase_assembly', undefined)).toBe(true)
    expect(isRewardOn('photo_choice', { reward: false })).toBe(false)
  })

  it('таблица «Авто» — по умолчанию выключена', () => {
    expect(isRewardOn('table', {})).toBe(false)
    expect(isRewardOn('table', { mode: 'dictator' })).toBe(false)
  })

  it('таблица «Авто» — но включить можно', () => {
    expect(isRewardOn('table', { mode: 'dictator', reward: true })).toBe(true)
  })

  it('остальные режимы таблицы — как у всех', () => {
    expect(isRewardOn('table', { mode: 'manual' })).toBe(true)
    expect(isRewardOn('table', { mode: 'demo' })).toBe(true)
    expect(isRewardOn('table', { mode: 'manual', reward: false })).toBe(false)
  })
})
