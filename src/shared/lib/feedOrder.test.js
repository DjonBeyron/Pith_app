import { describe, it, expect } from 'vitest'
import { mergeFeedOrder } from './feedOrder.js'

const node = id => ({ id })

describe('mergeFeedOrder', () => {
  it('без сигналов — просто ноды по порядку', () => {
    const nodes = [node('a'), node('b')]
    expect(mergeFeedOrder(nodes, [])).toEqual([
      { kind: 'node', node: nodes[0] },
      { kind: 'node', node: nodes[1] },
    ])
  })

  it('сигнал, сработавший ДО первой ноды (afterVisibleCount 0) — идёт первым', () => {
    const nodes = [node('a')]
    const sig = { key: 's1', node: node('sig'), afterVisibleCount: 0 }
    expect(mergeFeedOrder(nodes, [sig])).toEqual([
      { kind: 'signal', key: 's1', node: sig.node },
      { kind: 'node', node: nodes[0] },
    ])
  })

  it('сигнал между второй и третьей нодой встаёт именно там, а не в хвосте ленты', () => {
    const nodes = [node('a'), node('b'), node('c')]
    const sig = { key: 's1', node: node('sig'), afterVisibleCount: 2 }
    expect(mergeFeedOrder(nodes, [sig])).toEqual([
      { kind: 'node', node: nodes[0] },
      { kind: 'node', node: nodes[1] },
      { kind: 'signal', key: 's1', node: sig.node },
      { kind: 'node', node: nodes[2] },
    ])
  })

  it('два сигнала в одной точке — в порядке своего срабатывания', () => {
    const nodes = [node('a')]
    const sig1 = { key: 's1', node: node('x'), afterVisibleCount: 1 }
    const sig2 = { key: 's2', node: node('y'), afterVisibleCount: 1 }
    const merged = mergeFeedOrder(nodes, [sig1, sig2])
    expect(merged.map(e => e.key ?? e.node.id)).toEqual(['a', 's1', 's2'])
  })

  it('пустые visibleNodes и сигналы — пустой список', () => {
    expect(mergeFeedOrder([], [])).toEqual([])
  })
})
