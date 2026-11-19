import { describe, it, expect } from 'vitest'
import { laneTape } from './wordLaneTape.js'


describe('после финала (v3.3.284)', () => {
  it('stage reveal: лента остаётся, если последняя стадия — финал (boss); у обычной игры — нет', () => {
    expect(laneTape({ rh: { on: true }, stage: 'reveal', stages: [{ act: 'sprint' }, { act: 'boss' }] })).toBe(true)
    expect(laneTape({ rh: { on: true }, stage: 'reveal', stages: [{ act: 'sprint' }, { act: 'climb' }] })).toBe(false)
  })
})

describe('итог игры (v3.3.285)', () => {
  const stages = [{ act: 'phrases', idx: 0 }, { act: 'boss', idx: 1 }, { act: 'summary', idx: 2 }]
  it('стадия итога (summary) держит ленту, если до неё был финал или фразы; после обычного акта — три дорожки', () => {
    expect(laneTape({ rh: { on: true }, stage: 'run', stages, idx: 2, stageObj: stages[2] })).toBe(true)
    expect(laneTape({ rh: { on: true }, stage: 'paused', from: 'run', stages, idx: 2 })).toBe(true)
    const st2 = [{ act: 'climb', idx: 0 }, { act: 'summary', idx: 1 }]
    expect(laneTape({ rh: { on: true }, stage: 'run', stages: st2, idx: 1, stageObj: st2[1] })).toBe(false)
  })
})
