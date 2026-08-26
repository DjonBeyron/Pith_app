import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { useCanvasNodeOps } from './useCanvasNodeOps.js'
import { applyMove, applyResize, linkLine, MIN_W, MIN_H } from './noteBoxGeom.js'

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
    expect(board).toContain('{isAdmin && node.note != null && (')
    expect(board).toContain('<NodeNoteLayer')
    expect(read('./NodeNoteLayer.jsx')).toContain('if (folded) {')
    expect(read('./NodeNoteLayer.jsx')).toContain('<NodeNoteBox')
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
    expect(read('./CanvasBoard.jsx')).toContain('updateNode(node.id, { note: undefined, noteBox: undefined })')
  })

  it('свернуть и удалить — разные кнопки: сворачивание текст не теряет', () => {
    const box = read('./NodeNoteBox.jsx')
    expect(box).toContain('onClick={onFold}')
    expect(box).toContain('onClick={onRemove}')
    expect(read('./CanvasBoard.jsx')).toContain('onFold={() => toggleNote(node.id, true)}')
  })

  it('иконка в меню — глиф, как у соседних кнопок, и желтеет, когда заметка есть', () => {
    const menu = read('./NodeHoverMenu.jsx')
    expect(menu).toContain('>✎</button>')
    expect(menu).not.toContain('📝')
    expect(menu).toContain("hasNote ? ' nodeHoverBtnNoteOn' : ''")
  })
})

describe('стикер можно двигать и растягивать', () => {
  const box = { x: 100, y: 40, w: 200, h: 120 }

  it('перетаскивание сдвигает стикер на пройденное расстояние', () => {
    expect(applyMove(box, 30, -10)).toEqual({ x: 130, y: 30, w: 200, h: 120 })
  })

  it('тянем правый низ — растёт размер, угол на месте', () => {
    expect(applyResize(box, 'se', 40, 25)).toEqual({ x: 100, y: 40, w: 240, h: 145 })
  })

  it('тянем левый верх — вместе с размером едет и сам угол', () => {
    expect(applyResize(box, 'nw', -20, -15)).toEqual({ x: 80, y: 25, w: 220, h: 135 })
  })

  it('меньше минимума не ужимается, и угол при этом не уезжает дальше', () => {
    const tiny = applyResize(box, 'nw', 500, 500)
    expect([tiny.w, tiny.h]).toEqual([MIN_W, MIN_H])
    expect(tiny.x).toBe(box.x + box.w - MIN_W)
  })

  it('линия связи идёт от центра ноды к центру стикера', () => {
    expect(linkLine({ w: 308, h: 48 }, box)).toEqual({ x1: 154, y1: 24, x2: 200, y2: 100 })
  })

  it('масштаб холста учитывается — стикер не убегает от курсора на зуме', () => {
    const hook = read('./useNoteBoxDrag.js')
    expect(hook).toContain('const s = scaleRef?.current ?? 1')
    expect(hook).toContain('(mv.clientX - startX) / s')
  })

  it('ручки есть со всех восьми сторон', () => {
    expect(read('./NodeNoteBox.jsx')).toContain("const DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']")
    const css = read('../../styles/canvas/node-note.css')
    for (const d of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
      expect(css).toContain(`.nodeNoteGrip-${d}`)
    }
  })

  it('скролл заметки тёмный, а не системный белый', () => {
    const css = read('../../styles/canvas/node-note.css')
    expect(css).toContain('scrollbar-color: #6b5f1e #1d1a0c')
    expect(css).toContain('.nodeNoteInput::-webkit-scrollbar-thumb')
  })
})
