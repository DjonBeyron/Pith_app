import { describe, it, expect } from 'vitest'
import { toggleSelection, moveGroupFor, nodesInMarquee } from './canvasSelectionOps.js'

const ids = (set) => [...set].sort()

describe('toggleSelection — Shift+клик по ноде', () => {
  it('добавляет ноду, которой не было', () => {
    expect(ids(toggleSelection(new Set(['a']), 'b'))).toEqual(['a', 'b'])
  })

  it('убирает ноду, которая уже выделена', () => {
    expect(ids(toggleSelection(new Set(['a', 'b']), 'b'))).toEqual(['a'])
  })

  it('исходное множество не меняется — состояние обновляется новой ссылкой', () => {
    const before = new Set(['a'])
    const after = toggleSelection(before, 'b')
    expect(before.size).toBe(1)
    expect(after).not.toBe(before)
  })
})

describe('moveGroupFor — кого тянем за ноду', () => {
  it('нода вне выделения — двигается она одна', () => {
    expect(ids(moveGroupFor(new Set(['a', 'b']), 'c'))).toEqual(['c'])
  })

  it('нода из группы 2+ — двигается вся группа', () => {
    expect(ids(moveGroupFor(new Set(['a', 'b', 'c']), 'b'))).toEqual(['a', 'b', 'c'])
  })

  it('выделена ровно одна нода — она и двигается', () => {
    expect(ids(moveGroupFor(new Set(['a']), 'a'))).toEqual(['a'])
  })

  it('пустое выделение — двигается схваченная нода', () => {
    expect(ids(moveGroupFor(new Set(), 'z'))).toEqual(['z'])
  })
})

describe('nodesInMarquee — что попало в рамку', () => {
  const hitSize = () => ({ w: 220, h: 300 })
  const nodes = [
    { id: 'a', x: 0,   y: 0 },
    { id: 'b', x: 400, y: 0 },
    { id: 'c', x: 0,   y: 500 },
  ]

  it('рамка вокруг одной ноды берёт только её', () => {
    expect(nodesInMarquee(nodes, { x: -10, y: -10 }, { x: 100, y: 100 }, hitSize)).toEqual(['a'])
  })

  it('широкая рамка берёт все пересечённые', () => {
    const hit = nodesInMarquee(nodes, { x: -50, y: -50 }, { x: 900, y: 900 }, hitSize)
    expect(hit.sort()).toEqual(['a', 'b', 'c'])
  })

  it('направление протяжки не важно — рамка справа налево работает так же', () => {
    const forward = nodesInMarquee(nodes, { x: -10, y: -10 }, { x: 500, y: 100 }, hitSize)
    const back    = nodesInMarquee(nodes, { x: 500, y: 100 }, { x: -10, y: -10 }, hitSize)
    expect(back).toEqual(forward)
  })

  it('касание краем считается попаданием, пустая область — нет', () => {
    expect(nodesInMarquee(nodes, { x: 210, y: 10 }, { x: 260, y: 20 }, hitSize)).toEqual(['a'])
    expect(nodesInMarquee(nodes, { x: 260, y: 380 }, { x: 380, y: 460 }, hitSize)).toEqual([])
  })
})
