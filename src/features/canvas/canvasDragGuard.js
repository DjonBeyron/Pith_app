// Глушение нативного выделения текста на время любых протяжек в канвасе:
// перетаскивание ноды, панорама холста, рамка выделения, Shift+клик по нодам.
//
// Одного user-select мало: поля ввода внутри нод ему не подчиняются, и
// браузер продолжает тянуть выделение по всему документу — отсюда и
// подсвеченный текст сразу во всех нодах, и просадка кадров (каждое движение
// мыши = пересчёт выделения по DOM).

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
  document.body.style.userSelect = 'none'
}

// Класс на body вешается только когда протяжка ПОШЛА (мышь реально поехала),
// а не по нажатию. Он гасит наведение и клики по содержимому нод (drag.css) —
// поставь его сразу, и обычное нажатие на кнопку внутри ноды перестало бы
// засчитываться: к моменту отпускания цель уже не принимает события.
export function markDragging() {
  document.body.classList.add(DRAG_CLASS)
}

export function releaseTextSelection() {
  document.body.classList.remove(DRAG_CLASS)
  document.body.style.userSelect = ''
}
