import { describe, it, expect } from 'vitest'
import { triggerAnchor, nodeEntry, nodeBox } from './canvasPorts.js'

const maxNode = (over = {}) => ({
  id: 'a', x: 1000, y: 500, size: 'max', type: 'audio',
  triggers: [{ if: 'played', then: 'b' }], ...over,
})

describe('порты нод — всегда снаружи тела', () => {
  it('вход max-ноды левее её левого края', () => {
    const n = maxNode()
    expect(nodeEntry(n, {}).x).toBeLessThan(n.x)
  })

  it('вход mini и nano тоже снаружи — иначе конец линии прячется под нодой', () => {
    for (const size of ['mini', 'nano']) {
      const n = maxNode({ size })
      expect(nodeEntry(n, {}).x, size).toBeLessThan(n.x)
    }
  })

  it('выход правее правого края при любом размере', () => {
    const widths = { nano: 42, mini: 255, max: 308 }
    for (const [size, w] of Object.entries(widths)) {
      const n = maxNode({ size })
      expect(triggerAnchor(n, 0, {}).x, size).toBeGreaterThan(n.x + w)
    }
  })

  it('вход max-ноды встаёт по замеренной строке «Тогда»', () => {
    const n = maxNode()
    const measured = nodeEntry(n, { a: [140] })
    expect(measured.y).toBe(n.y + 140)
  })

  it('выход берёт строку своего триггера, а не первого', () => {
    const n = maxNode({ triggers: [{ if: 'played' }, { if: 'timer' }] })
    const measures = { a: [100, 200] }
    expect(triggerAnchor(n, 1, measures).y).toBe(n.y + 200)
  })
})

describe('nodeBox — тело ноды как препятствие для линий', () => {
  it('свёрнутые ноды имеют фиксированный размер', () => {
    const nano = nodeBox(maxNode({ size: 'nano' }))
    expect(nano.right - nano.left).toBe(42)
    expect(nano.bottom - nano.top).toBe(42)

    const mini = nodeBox(maxNode({ size: 'mini' }))
    expect(mini.right - mini.left).toBe(255)
  })

  it('высота max-ноды считается по последней замеренной строке', () => {
    const n = maxNode({ triggers: [{ if: 'played' }, { if: 'timer' }] })
    const box = nodeBox(n, { a: [100, 300] })
    expect(box.bottom).toBeGreaterThan(n.y + 300)
    expect(box.right - box.left).toBe(308)
  })

  it('без замеров высота берётся из расчёта — бокс не схлопывается', () => {
    const box = nodeBox(maxNode(), {})
    expect(box.bottom - box.top).toBeGreaterThan(100)
  })

  it('порты лежат вплотную к боксу, но снаружи', () => {
    const n = maxNode()
    const box = nodeBox(n, {})
    expect(nodeEntry(n, {}).x).toBeLessThan(box.left)
    expect(triggerAnchor(n, 0, {}).x).toBeGreaterThan(box.right)
  })
})
