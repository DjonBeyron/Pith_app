import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { findFreeSpot, NODE_SLOT, NODE_ROW } from './nodeGraph.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const at = (x, y) => ({ id: `${x}:${y}`, x, y })

describe('куда встаёт новая нода', () => {
  it('на пустом месте — ровно куда просили', () => {
    expect(findFreeSpot([at(0, 0)], NODE_SLOT, 0)).toEqual({ x: NODE_SLOT, y: 0 })
  })

  it('место занято — спускается ниже на ряд, по горизонтали не уезжает', () => {
    const nodes = [at(0, 0), at(NODE_SLOT, 0)]
    expect(findFreeSpot(nodes, NODE_SLOT, 0)).toEqual({ x: NODE_SLOT, y: NODE_ROW })
  })

  it('занято несколько рядов подряд — ищет дальше вниз', () => {
    const nodes = [at(NODE_SLOT, 0), at(NODE_SLOT, NODE_ROW), at(NODE_SLOT, NODE_ROW * 2)]
    expect(findFreeSpot(nodes, NODE_SLOT, 0)).toEqual({ x: NODE_SLOT, y: NODE_ROW * 3 })
  })

  it('нода в стороне по горизонтали не мешает', () => {
    const far = [at(NODE_SLOT * 3, 0)]
    expect(findFreeSpot(far, NODE_SLOT, 0)).toEqual({ x: NODE_SLOT, y: 0 })
  })

  it('пустой холст и мусор в данных не ломают расчёт', () => {
    expect(findFreeSpot([], 10, 20)).toEqual({ x: 10, y: 20 })
    expect(findFreeSpot(null, 10, 20)).toEqual({ x: 10, y: 20 })
    expect(findFreeSpot([{ id: 'x' }], 0, 0)).toEqual({ x: 0, y: NODE_ROW })
  })
})

describe('соседи остаются на своих местах', () => {
  const ops = read('./useCanvasNodeOps.js')

  it('вставка через «+» никого не двигает', () => {
    const fn = ops.slice(ops.indexOf('function insertAfterNode'), ops.indexOf('function insertFromPort'))
    expect(fn).toContain('findFreeSpot(prev, node.x + NODE_SLOT, node.y)')
    expect(fn).not.toContain('shiftRight(')
  })

  it('вставка с порта (точки) — тоже', () => {
    const fn = ops.slice(ops.indexOf('function insertFromPort'))
    expect(fn).toContain('findFreeSpot(prev, node.x + NODE_SLOT, y)')
    expect(fn).not.toContain('shiftRight(')
  })
})
