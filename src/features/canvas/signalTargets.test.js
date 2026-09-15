import { describe, it, expect } from 'vitest'
import { collectSignalTargetIds } from './signalTargets.js'

describe('collectSignalTargetIds', () => {
  it('собирает ref из signals обоих типов (table и phrase_assembly)', () => {
    const nodes = [
      { id: 'n1', type: 'table', typeData: { table: { signals: [{ slot: 0, ref: 'n3' }] } } },
      { id: 'n2', type: 'phrase_assembly', typeData: { phrase_assembly: { signals: [{ slot: 1, ref: 'n4' }] } } },
      { id: 'n3', type: 'audio', typeData: {} },
      { id: 'n4', type: 'text', typeData: {} },
      { id: 'n5', type: 'text', typeData: {} },
    ]
    expect(collectSignalTargetIds(nodes)).toEqual(new Set(['n3', 'n4']))
  })

  it('без signals — пустое множество, без падения', () => {
    const nodes = [{ id: 'n1', type: 'table', typeData: { table: {} } }, { id: 'n2', type: 'text' }]
    expect(collectSignalTargetIds(nodes)).toEqual(new Set())
    expect(collectSignalTargetIds(undefined)).toEqual(new Set())
  })

  it('одна нода — цель нескольких сигналов сразу — попадает один раз', () => {
    const nodes = [
      { id: 'n1', type: 'table', typeData: { table: { signals: [{ slot: 0, ref: 'n2' }, { slot: 1, ref: 'n2' }] } } },
      { id: 'n2', type: 'audio', typeData: {} },
    ]
    expect(collectSignalTargetIds(nodes)).toEqual(new Set(['n2']))
  })
})
