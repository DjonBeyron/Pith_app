import { describe, it, expect, beforeEach, vi } from 'vitest'
import { suppressTextSelection, markDragging, releaseTextSelection } from './canvasDragGuard.js'

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

  it('на теле ноды выделение не начинается: preventDefault + запрет user-select', () => {
    const e = mouseEvent('DIV')
    suppressTextSelection(e)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(document.body.style.userSelect).toBe('none')
  })

  // Тот самый баг: класс гасит клики по содержимому ноды, и если вешать его
  // по нажатию, кнопка внутри ноды («верный ответ») перестаёт нажиматься
  it('по одному нажатию клики внутри ноды НЕ блокируются', () => {
    suppressTextSelection(mouseEvent('DIV'))
    expect(classes.has('canvasDragging')).toBe(false)
  })

  it('блокировка включается только когда протяжка пошла', () => {
    suppressTextSelection(mouseEvent('DIV'))
    markDragging()
    expect(classes.has('canvasDragging')).toBe(true)
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

  it('старт из поля ввода: запрет выделения ставится, клики не блокируются', () => {
    suppressTextSelection(mouseEvent('TEXTAREA'))
    expect(document.body.style.userSelect).toBe('none')
    expect(classes.has('canvasDragging')).toBe(false)
  })

  it('без события не падает (страховка на вызовы из кода)', () => {
    expect(() => suppressTextSelection(undefined)).not.toThrow()
    expect(document.body.style.userSelect).toBe('none')
  })
})

describe('releaseTextSelection — возврат в обычное состояние', () => {
  it('снимает и класс, и запрет выделения', () => {
    const classes = setupDom()
    selection = { isCollapsed: true, removeAllRanges: vi.fn() }
    suppressTextSelection(mouseEvent('DIV'))
    markDragging()
    releaseTextSelection()
    expect(classes.has('canvasDragging')).toBe(false)
    expect(document.body.style.userSelect).toBe('')
  })

  it('повторный вызов безопасен — mouseup приходит и без начатой протяжки', () => {
    setupDom()
    expect(() => { releaseTextSelection(); releaseTextSelection() }).not.toThrow()
  })
})
