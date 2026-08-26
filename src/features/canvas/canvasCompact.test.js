import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { compactLayout, graphSize, PER_ROW } from './canvasCompact.js'
import { NODE_SLOT, NODE_ROW } from './nodeGraph.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  }
})

// Цепочка из 14 нод, растянутая в одну длинную ленту
const chain = (count = 14) => Array.from({ length: count }, (_, i) => ({
  id: `n${i}`, seq: i + 1, x: i * 1000, y: 0, size: 'max', type: 'text',
  typeData: { text: { content: '' } },
  triggers: [{ id: `t${i}`, if: 'timer', then: i + 1 < count ? `n${i + 1}` : null }],
}))

describe('сжатие раскладки', () => {
  it('лента превращается в несколько рядов', () => {
    const before = graphSize(chain())
    const after = graphSize(compactLayout(chain()))
    expect(before.w).toBe(13000)
    expect(after.w).toBe((PER_ROW - 1) * NODE_SLOT)
    expect(after.h).toBeGreaterThan(0)
    expect(after.w).toBeLessThan(before.w / 5)
  })

  it('порядок сценария сохраняется: слева направо, ряд за рядом', () => {
    const out = compactLayout(chain(8), { perRow: 4, startX: 0, startY: 0 })
    const byId = Object.fromEntries(out.map(n => [n.id, n]))
    expect([byId.n0.x, byId.n0.y]).toEqual([0, 0])
    expect([byId.n3.x, byId.n3.y]).toEqual([3 * NODE_SLOT, 0])
    expect([byId.n4.x, byId.n4.y]).toEqual([0, NODE_ROW])
  })

  it('меняются только координаты — ноды, связи и типы не трогаются', () => {
    const src = chain(5)
    const out = compactLayout(src)
    expect(out.map(n => n.id)).toEqual(src.map(n => n.id))
    expect(out.map(n => n.triggers[0].then)).toEqual(src.map(n => n.triggers[0].then))
    expect(out.every((n, i) => n.type === src[i].type && n.typeData === src[i].typeData)).toBe(true)
  })

  it('пустой урок не ломает расчёт', () => {
    expect(compactLayout([])).toEqual([])
    expect(graphSize([])).toEqual({ w: 0, h: 0 })
  })

  it('доступно из меню холста', () => {
    expect(read('./CanvasPage.jsx')).toContain("label: 'Сжать раскладку'")
    expect(read('./CanvasPage.jsx')).toContain('boardApiRef.current?.compactLayout()')
    expect(read('./useCanvasBoardApi.js')).toContain("dbg('[LAYOUT] сжатие:'")
  })
})
