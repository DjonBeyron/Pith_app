import { describe, it, expect } from 'vitest'
import { spreadNodes } from './canvasSpread.js'

const n = (id, x, y = 0) => ({ id, x, y, size: 'max', type: 'text' })
const xs = list => list.map(o => o.x)

describe('spreadNodes — разводит наехавшие друг на друга ноды', () => {
  it('колонки, стоящие вплотную, раздвигаются на заданный шаг', () => {
    const out = spreadNodes([n('a', 0), n('b', 260), n('c', 520)], 348)
    expect(xs(out)).toEqual([0, 348, 696])
  })

  it('первая колонка остаётся на месте — граф не уезжает с экрана', () => {
    const out = spreadNodes([n('a', 1200), n('b', 1460)], 348)
    expect(out[0].x).toBe(1200)
  })

  it('уже просторный граф не сжимается', () => {
    const out = spreadNodes([n('a', 0), n('b', 900), n('c', 2000)], 348)
    expect(xs(out)).toEqual([0, 900, 2000])
  })

  it('ноды одной колонки едут вместе, вертикаль не меняется', () => {
    const out = spreadNodes([n('a', 0, 0), n('b', 260, 0), n('c', 260, 400)], 348)
    const moved = out.filter(o => o.id !== 'a')
    expect(moved.every(o => o.x === 348)).toBe(true)
    expect(out.map(o => o.y)).toEqual([0, 0, 400])
  })

  it('лёгкий разброс внутри колонки не рвёт её на части', () => {
    // 260 и 285 — это одна колонка, просто ноды не выровнены идеально
    const out = spreadNodes([n('a', 0), n('b', 260), n('c', 285)], 348)
    expect(out[1].x).toBe(348)
    expect(out[2].x).toBe(373)
  })

  it('один узел или пустой граф остаются как есть', () => {
    expect(spreadNodes([])).toEqual([])
    const one = [n('a', 42)]
    expect(spreadNodes(one)).toBe(one)
  })

  it('ничего не меняется — возвращаются те же объекты, лишних перерисовок нет', () => {
    const list = [n('a', 0), n('b', 900)]
    const out = spreadNodes(list, 348)
    expect(out[0]).toBe(list[0])
    expect(out[1]).toBe(list[1])
  })
})
