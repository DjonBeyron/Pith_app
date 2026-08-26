import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { useCanvasNodeOps } from './useCanvasNodeOps.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  }
})

function useOps(initial) {
  let nodes = initial
  const setNodes = fn => { nodes = typeof fn === 'function' ? fn(nodes) : fn }
  return { ops: useCanvasNodeOps(setNodes), get: () => nodes }
}

const noted = () => [{
  id: 'a', seq: 1, x: 0, y: 0, size: 'max', type: 'text',
  typeData: { text: { content: '' } },
  triggers: [{ id: 't', if: 'played', then: null }],
  note: 'переснять дубль',
}]

describe('комментарий продакшена живёт в самой ноде', () => {
  it('едет вместе с дубликатом ноды', () => {
    const { ops, get } = useOps(noted())
    ops.duplicateNode('a')
    expect(get().filter(n => n.note === 'переснять дубль')).toHaveLength(2)
  })

  it('едет и с копией «без связей» (Shift+протяжка)', () => {
    const { ops, get } = useOps(noted())
    const copyId = ops.duplicateDetached('a')
    expect(get().find(n => n.id === copyId).note).toBe('переснять дубль')
  })
})

describe('комментарий не виден никому, кроме админа в канвасе', () => {
  it('плеер поле note не читает вообще', () => {
    const dir = fileURLToPath(new URL('../player/', import.meta.url))
    const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? walk(`${d}${e.name}/`) : [`${d}${e.name}`])
    const hits = walk(dir)
      .filter(f => /\.jsx?$/.test(f) && !f.endsWith('.test.js'))
      .filter(f => /\bnode\.note\b|\bnotes\b/.test(readFileSync(f, 'utf8')))
    expect(hits).toEqual([])
  })

  it('стикер и метка на холсте рендерятся только под isAdmin', () => {
    const board = read('./CanvasBoard.jsx')
    expect(board).toContain('{isAdmin && isNoteOpen(node) && (')
    expect(board).toContain('{isAdmin && isNoteFolded(node) && (')
    expect(board).toContain('<NodeNoteBox')
  })

  it('кнопка 📝 в меню ноды — тоже только для админа', () => {
    const menu = read('./NodeHoverMenu.jsx')
    const noteBtn = menu.slice(menu.indexOf('nodeHoverBtnNote'))
    expect(menu.slice(0, menu.indexOf('nodeHoverBtnNote'))).toContain('{isAdmin && (')
    expect(noteBtn).toContain('onToggleNote()')
  })

  it('свёрнутый комментарий не теряет текст — прячется только стикер', () => {
    const hook = read('./useNodeNotes.js')
    expect(hook).toContain("updateNode(nodeId, { note: '' })")
    // сворачивание трогает только локальный набор скрытых, не саму ноду
    expect(hook).toContain('if (s.has(nodeId)) s.delete(nodeId); else s.add(nodeId)')
    // ноду хук правит ровно один раз — когда заводит пустую заметку
    expect((hook.match(/updateNode\(nodeId/g) ?? [])).toHaveLength(1)
  })

  it('удаление комментария стирает поле у ноды', () => {
    expect(read('./CanvasBoard.jsx')).toContain('updateNode(node.id, { note: undefined })')
  })
})
