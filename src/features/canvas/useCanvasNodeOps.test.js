import { describe, it, expect, beforeEach } from 'vitest'
import { useCanvasNodeOps } from './useCanvasNodeOps.js'
import { NODE_SLOT, NODE_ROW } from './nodeGraph.js'

// Хук — тонкая обёртка над setNodes: подсовываем свой setNodes и вызываем
// операции напрямую, без React
beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  }
})

// Имя с use — правило хуков иначе ругается на прямой вызов, хотя React тут
// вообще не участвует: хук не держит состояния, только оборачивает setNodes
function useOps(initial) {
  let nodes = initial
  const setNodes = fn => { nodes = typeof fn === 'function' ? fn(nodes) : fn }
  const ops = useCanvasNodeOps(setNodes)
  return { ops, get: () => nodes }
}

const node = (id, seq, x, y, triggers) => ({
  id, seq, x, y, size: 'max', type: 'text',
  typeData: { text: { content: '' } },
  triggers,
})

// Нода-развилка с тремя выходами: два заняты, один свободен
const forkGraph = () => [
  node('a', 1, 0, 0, [
    { id: 't1', if: 'word_correct', then: null },
    { id: 't2', if: 'word_wrong', then: null },
    { id: 't3', if: 'opt', then: null },
  ]),
  node('far', 2, 1000, 0, [{ id: 't', if: 'timer', then: null }]),
]

describe('insertFromPort — ветки не расталкивают граф вправо', () => {
  it('первая ветка освобождает место: соседи справа сдвигаются', () => {
    const { ops, get } = useOps(forkGraph())
    ops.insertFromPort('a', 0, 'text')
    const far = get().find(n => n.id === 'far')
    expect(far.x).toBe(1000 + NODE_SLOT)
  })

  it('вторая ветка граф уже не двигает', () => {
    const { ops, get } = useOps(forkGraph())
    ops.insertFromPort('a', 0, 'text')
    const afterFirst = get().find(n => n.id === 'far').x
    ops.insertFromPort('a', 1, 'text')
    expect(get().find(n => n.id === 'far').x).toBe(afterFirst)
  })

  it('вторая ветка встаёт ниже первой, в той же колонке', () => {
    const { ops, get } = useOps(forkGraph())
    ops.insertFromPort('a', 0, 'text')
    const first = get().find(n => n.id === get().find(x => x.id === 'a').triggers[0].then)
    ops.insertFromPort('a', 1, 'text')
    const second = get().find(n => n.id === get().find(x => x.id === 'a').triggers[1].then)
    expect(second.x).toBe(first.x)
    expect(second.y).toBe(first.y + NODE_ROW)
  })

  it('третья ветка уходит ещё ниже — ноды не накладываются', () => {
    const { ops, get } = useOps(forkGraph())
    ops.insertFromPort('a', 0, 'text')
    ops.insertFromPort('a', 1, 'text')
    ops.insertFromPort('a', 2, 'text')
    const ys = get().find(n => n.id === 'a').triggers
      .map(t => get().find(n => n.id === t.then).y)
    expect(new Set(ys).size).toBe(3)
    expect(ys[2]).toBe(ys[1] + NODE_ROW)
  })

  it('новая нода привязана именно к своему выходу', () => {
    const { ops, get } = useOps(forkGraph())
    ops.insertFromPort('a', 1, 'sticker')
    const trg = get().find(n => n.id === 'a').triggers
    expect(trg[0].then).toBeNull()
    expect(trg[2].then).toBeNull()
    expect(get().find(n => n.id === trg[1].then).type).toBe('sticker')
  })
})

describe('insertAfterNode — «+» вставляет в цепочку', () => {
  it('освобождает место: соседи справа сдвигаются', () => {
    const { ops, get } = useOps(forkGraph())
    ops.insertAfterNode('a', 'text')
    expect(get().find(n => n.id === 'far').x).toBe(1000 + NODE_SLOT)
  })

  it('вставка в середину перецепляет связь A → новая → B', () => {
    const { ops, get } = useOps(forkGraph())
    ops.insertFromPort('a', 0, 'text')          // A → B
    const bId = get().find(n => n.id === 'a').triggers[0].then
    ops.insertAfterNode('a', 'sticker')          // A → новая → B
    const midId = get().find(n => n.id === 'a').triggers[0].then
    expect(midId).not.toBe(bId)
    const mid = get().find(n => n.id === midId)
    expect(mid.type).toBe('sticker')
    expect(mid.triggers.some(t => t.then === bId)).toBe(true)
  })
})
