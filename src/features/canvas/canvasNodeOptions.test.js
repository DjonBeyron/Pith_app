import { describe, it, expect } from 'vitest'
import { nodeOptionsSignature, pickNodeOptions } from './canvasNodeOptions.js'

const graph = () => ([
  { id: 'a', seq: 1, x: 100, y: 100, type: 'text',  typeData: { text: { content: 'привет' } } },
  { id: 'b', seq: 2, x: 400, y: 100, type: 'audio', typeData: { audio: { file_id: 'f1' } } },
  { id: 'c', seq: 3, x: 700, y: 100, type: 'word_choice', typeData: { word_choice: { options: [] } } },
])

// Главное свойство: пока меняются только координаты, отпечаток обязан
// оставаться прежним — иначе useMemo в CanvasBoard отдаст новую ссылку, и на
// каждом кадре протяжки перерисуются все max-ноды графа
describe('nodeOptionsSignature — что считается изменением списка', () => {
  it('перетаскивание ноды отпечаток не меняет', () => {
    const before = nodeOptionsSignature(graph())
    const moved = graph().map(n => n.id === 'b' ? { ...n, x: n.x + 137, y: n.y - 42 } : n)
    expect(nodeOptionsSignature(moved)).toBe(before)
  })

  it('движение всех нод сразу (протяжка группы) — тоже не меняет', () => {
    const before = nodeOptionsSignature(graph())
    const moved = graph().map(n => ({ ...n, x: n.x + 50, y: n.y + 50 }))
    expect(nodeOptionsSignature(moved)).toBe(before)
  })

  it('новая нода меняет отпечаток', () => {
    const before = nodeOptionsSignature(graph())
    const added = [...graph(), { id: 'd', seq: 4, x: 0, y: 0, type: 'text', typeData: {} }]
    expect(nodeOptionsSignature(added)).not.toBe(before)
  })

  it('удаление ноды меняет отпечаток', () => {
    const before = nodeOptionsSignature(graph())
    expect(nodeOptionsSignature(graph().filter(n => n.id !== 'b'))).not.toBe(before)
  })

  it('смена типа и смена номера меняют отпечаток', () => {
    const before = nodeOptionsSignature(graph())
    const retyped = graph().map(n => n.id === 'b' ? { ...n, type: 'video' } : n)
    const renumbered = graph().map(n => n.id === 'b' ? { ...n, seq: 9 } : n)
    expect(nodeOptionsSignature(retyped)).not.toBe(before)
    expect(nodeOptionsSignature(renumbered)).not.toBe(before)
  })

  it('правка текста меняет отпечаток — превью в списке «В ответ на» живое', () => {
    const before = nodeOptionsSignature(graph())
    const edited = graph().map(n => n.id === 'a'
      ? { ...n, typeData: { text: { content: 'привет, мир' } } } : n)
    expect(nodeOptionsSignature(edited)).not.toBe(before)
  })

  it('пустой граф и ноды без typeData не ломают расчёт', () => {
    expect(nodeOptionsSignature([])).toBe('')
    expect(() => nodeOptionsSignature([{ id: 'x', seq: 1, type: 'text' }])).not.toThrow()
  })
})

describe('pickNodeOptions — что уезжает в дропдауны', () => {
  it('координат в списке нет, остальное на месте', () => {
    const opts = pickNodeOptions(graph())
    expect(opts).toHaveLength(3)
    for (const o of opts) {
      expect(o).not.toHaveProperty('x')
      expect(o).not.toHaveProperty('y')
      expect(o.id).toBeTruthy()
      expect(typeof o.seq).toBe('number')
    }
  })

  it('typeData передаётся той же ссылкой — превью и настройки не копируются', () => {
    const nodes = graph()
    const opts = pickNodeOptions(nodes)
    expect(opts[0].typeData).toBe(nodes[0].typeData)
  })
})
