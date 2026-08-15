import { describe, it, expect, beforeEach, vi } from 'vitest'
import { suppressTextSelection, releaseTextSelection } from './canvasDragGuard.js'

// Минимальные заглушки DOM: тесты идут в node-окружении, полноценный документ
// не нужен — важна сама логика «когда гасим выделение, а когда нет»
function setupDom() {
  const classes = new Set()
  globalThis.document = {
    body: {
      style: { userSelect: '' },
      classList: {
        add: c => classes.add(c),
        remove: c => classes.delete(c),
        contains: c => classes.has(c),
      },
    },
  }
  globalThis.window = { getSelection: () => selection }
  return classes
}

let selection

function mouseEvent(tagName, extra = {}) {
  return {
    target: { tagName, ...extra },
    preventDefault: vi.fn(),
  }
}

describe('suppressTextSelection — что происходит на старте протяжки', () => {
  let classes
  beforeEach(() => {
    classes = setupDom()
    selection = { isCollapsed: true, removeAllRanges: vi.fn() }
  })

  it('на теле ноды выделение не начинается: preventDefault + класс на body', () => {
    const e = mouseEvent('DIV')
    suppressTextSelection(e)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(classes.has('canvasDragging')).toBe(true)
    expect(document.body.style.userSelect).toBe('none')
  })

  it('уже стоящее выделение снимается — иначе оно тянется по всем нодам', () => {
    selection = { isCollapsed: false, removeAllRanges: vi.fn() }
    suppressTextSelection(mouseEvent('DIV'))
    expect(selection.removeAllRanges).toHaveBeenCalled()
  })

  it('клик в поле ввода не блокируется — курсор и выделение текста работают', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
      const e = mouseEvent(tag)
      suppressTextSelection(e)
      expect(e.preventDefault, tag).not.toHaveBeenCalled()
    }
    const editable = mouseEvent('DIV', { isContentEditable: true })
    suppressTextSelection(editable)
    expect(editable.preventDefault).not.toHaveBeenCalled()
  })

  it('но класс на body ставится даже при старте из поля ввода', () => {
    suppressTextSelection(mouseEvent('TEXTAREA'))
    expect(classes.has('canvasDragging')).toBe(true)
  })

  it('без события не падает (страховка на вызовы из кода)', () => {
    expect(() => suppressTextSelection(undefined)).not.toThrow()
    expect(classes.has('canvasDragging')).toBe(true)
  })
})

describe('releaseTextSelection — возврат в обычное состояние', () => {
  it('снимает и класс, и запрет выделения', () => {
    const classes = setupDom()
    selection = { isCollapsed: true, removeAllRanges: vi.fn() }
    suppressTextSelection(mouseEvent('DIV'))
    releaseTextSelection()
    expect(classes.has('canvasDragging')).toBe(false)
    expect(document.body.style.userSelect).toBe('')
  })

  it('повторный вызов безопасен — mouseup приходит и без начатой протяжки', () => {
    setupDom()
    expect(() => { releaseTextSelection(); releaseTextSelection() }).not.toThrow()
  })
})
