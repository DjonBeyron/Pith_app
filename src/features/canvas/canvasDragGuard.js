// Глушение нативного выделения текста на время любых протяжек в канвасе:
// перетаскивание ноды, панорама холста, рамка выделения, Shift+клик по нодам.
//
// Одного user-select мало: поля ввода внутри нод ему не подчиняются, и
// браузер продолжает тянуть выделение по всему документу — отсюда и
// подсвеченный текст сразу во всех нодах, и просадка кадров (каждое движение
// мыши = пересчёт выделения по DOM). Нужны три вещи разом: не дать событию
// начать выделение, снять уже стоящее и пометить body классом (drag.css).

const DRAG_CLASS = 'canvasDragging'

function isEditable(el) {
  const tag = el?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el?.isContentEditable
}

// e — mousedown. Клики в поля ввода не трогаем: там курсор и выделение
// текста пользователю как раз нужны.
export function suppressTextSelection(e) {
  if (!isEditable(e?.target)) {
    e?.preventDefault?.()
    const sel = window.getSelection?.()
    if (sel && !sel.isCollapsed) sel.removeAllRanges()
  }
  document.body.classList.add(DRAG_CLASS)
  document.body.style.userSelect = 'none'
}

export function releaseTextSelection() {
  document.body.classList.remove(DRAG_CLASS)
  document.body.style.userSelect = ''
}
