import { describe, it, expect } from 'vitest'
import { rankNodes, shownNodes } from './useStagedNodes.js'

const N = (id, x, y = 0) => ({ id, x, y })
const view = { offset: { x: 0, y: 0 }, scale: 1, vw: 1000, vh: 800 }

describe('поэтапное появление нод', () => {
  it('очередь — по близости к центру кадра', () => {
    const nodes = [N('far', 9000), N('mid', 1500), N('near', 300), N('left', -2000)]
    const rank = rankNodes(nodes, view)
    expect([...rank.keys()]).toEqual(['near', 'mid', 'left', 'far'])
    expect(rank.get('near')).toBe(0)
  })
  it('сдвиг кадра меняет очередь: смотрим на дальнюю ноду — она первая', () => {
    const nodes = [N('a', 100), N('b', 9000)]
    const rank = rankNodes(nodes, { ...view, offset: { x: -8700, y: 0 } })
    expect(rank.get('b')).toBe(0)
  })
  it('показываем первые count, а ноды вне очереди (добавлены позже) — сразу', () => {
    const nodes = [N('a', 100), N('b', 3000), N('c', 6000)]
    const rank = rankNodes(nodes, view)
    expect(shownNodes(nodes, rank, 1).map(n => n.id)).toEqual(['a'])
    expect(shownNodes([...nodes, N('new', 8000)], rank, 2).map(n => n.id)).toEqual(['a', 'b', 'new'])
    expect(shownNodes(nodes, rank, 3)).toHaveLength(3)
  })
})
