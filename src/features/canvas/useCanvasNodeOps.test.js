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

describe('insertFromPort — ветки не расталкивают граф', () => {
  it('соседи остаются на своих местах — раскладку автора не перекраиваем', () => {
    const { ops, get } = useOps(forkGraph())
    ops.insertFromPort('a', 0, 'text')
    expect(get().find(n => n.id === 'far').x).toBe(1000)
  })

  it('вторая ветка граф тоже не двигает', () => {
    const { ops, get } = useOps(forkGraph())
    ops.insertFromPort('a', 0, 'text')
    ops.insertFromPort('a', 1, 'text')
    expect(get().find(n => n.id === 'far').x).toBe(1000)
  })

  it('новая нода встаёт рядом с исходной, с отступом вправо', () => {
    const { ops, get } = useOps(forkGraph())
    ops.insertFromPort('a', 0, 'text')
    const a = get().find(n => n.id === 'a')
    const added = get().find(n => n.id === a.triggers[0].then)
    expect(added.x).toBe(a.x + NODE_SLOT)
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
  it('соседи остаются на местах, новая нода — рядом с исходной', () => {
    const { ops, get } = useOps(forkGraph())
    const before = new Set(get().map(n => n.id))
    ops.insertAfterNode('a', 'text')
    expect(get().find(n => n.id === 'far').x).toBe(1000)
    const added = get().find(n => !before.has(n.id))
    const a = get().find(n => n.id === 'a')
    expect(added.x).toBe(a.x + NODE_SLOT)
    expect(added.y).toBe(a.y)
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

describe('duplicateDetached — Shift+протяжка ноды', () => {
  const linked = () => [
    node('a', 1, 0, 0, [{ id: 't1', if: 'played', then: 'b' }]),
    node('b', 2, NODE_SLOT, 0, [{ id: 't2', if: 'played', then: null }]),
  ]

  it('копия ни на кого не ссылается', () => {
    const { ops, get } = useOps(linked())
    const copyId = ops.duplicateDetached('a')
    const copy = get().find(n => n.id === copyId)
    expect(copy.triggers.every(t => !t.then)).toBe(true)
  })

  it('на копию никто не ссылается — оригинальные связи не тронуты', () => {
    const { ops, get } = useOps(linked())
    const copyId = ops.duplicateDetached('a')
    expect(get().find(n => n.id === 'a').triggers[0].then).toBe('b')
    expect(get().some(n => n.triggers.some(t => t.then === copyId))).toBe(false)
  })

  it('соседей не двигает — копия появляется на месте оригинала', () => {
    const { ops, get } = useOps(linked())
    const copyId = ops.duplicateDetached('a')
    expect(get().find(n => n.id === 'b').x).toBe(NODE_SLOT)
    const copy = get().find(n => n.id === copyId)
    expect([copy.x, copy.y]).toEqual([0, 0])
  })

  it('typeData копируется, а не разделяется с оригиналом', () => {
    const { ops, get } = useOps(linked())
    const copyId = ops.duplicateDetached('a')
    const copy = get().find(n => n.id === copyId)
    copy.typeData.text.content = 'изменено'
    expect(get().find(n => n.id === 'a').typeData.text.content).toBe('')
  })
})

describe('insertFromPort — клик по ЗАНЯТОМУ выходу вставляет ноду между', () => {
  // A → B, плюс дальний сосед, который двигаться не должен
  const chain = () => [
    node('a', 1, 0, 0, [{ id: 't1', if: 'played', then: 'b' }]),
    node('b', 2, NODE_SLOT * 4, 0, [{ id: 't2', if: 'played', then: null }]),
    node('far', 3, 2000, 0, [{ id: 't3', if: 'timer', then: null }]),
  ]

  it('A → new → B: связь A → B не теряется', () => {
    const { ops, get } = useOps(chain())
    ops.insertFromPort('a', 0, 'text')
    const a = get().find(n => n.id === 'a')
    const added = get().find(n => n.id === a.triggers[0].then)
    expect(added.id).not.toBe('b')
    expect(added.triggers[0].then).toBe('b')
  })

  it('никого не сдвигает', () => {
    const { ops, get } = useOps(chain())
    ops.insertFromPort('a', 0, 'text')
    expect(get().find(n => n.id === 'b').x).toBe(NODE_SLOT * 4)
    expect(get().find(n => n.id === 'far').x).toBe(2000)
  })

  it('встаёт посередине между A и B', () => {
    const { ops, get } = useOps(chain())
    ops.insertFromPort('a', 0, 'text')
    const a = get().find(n => n.id === 'a')
    const added = get().find(n => n.id === a.triggers[0].then)
    expect(added.x).toBe(NODE_SLOT * 2)
    expect(added.y).toBe(0)
  })

  it('номера пересчитываются по цепочке: A=1, new=2, B=3', () => {
    const { ops, get } = useOps(chain())
    ops.insertFromPort('a', 0, 'text')
    const a = get().find(n => n.id === 'a')
    const added = get().find(n => n.id === a.triggers[0].then)
    expect([a.seq, added.seq, get().find(n => n.id === 'b').seq]).toEqual([1, 2, 3])
  })

  it('у развилки вставка идёт только в ту ветку, по которой кликнули', () => {
    const { ops, get } = useOps([
      node('a', 1, 0, 0, [
        { id: 't1', if: 'word_correct', then: 'b' },
        { id: 't2', if: 'word_wrong', then: 'c' },
      ]),
      node('b', 2, NODE_SLOT * 4, 0, [{ id: 'tb', if: 'played', then: null }]),
      node('c', 3, NODE_SLOT * 4, NODE_ROW, [{ id: 'tc', if: 'played', then: null }]),
    ])
    ops.insertFromPort('a', 1, 'text')
    const a = get().find(n => n.id === 'a')
    expect(a.triggers[0].then).toBe('b')
    const added = get().find(n => n.id === a.triggers[1].then)
    expect(added.triggers[0].then).toBe('c')
  })
})
