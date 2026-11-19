import { describe, it, expect } from 'vitest'
import { laneTape } from './wordLaneTape.js'


describe('после финала (v3.3.284)', () => {
  it('stage reveal: лента остаётся, если последняя стадия — финал (boss); у обычной игры — нет', () => {
    expect(laneTape({ rh: { on: true }, stage: 'reveal', stages: [{ act: 'sprint' }, { act: 'boss' }] })).toBe(true)
    expect(laneTape({ rh: { on: true }, stage: 'reveal', stages: [{ act: 'sprint' }, { act: 'climb' }] })).toBe(false)
  })
})
