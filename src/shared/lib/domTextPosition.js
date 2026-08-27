// Перевод между DOM-позицией (узел + смещение) и индексом в исходной строке
// текста для plain-text-with-<br> контейнера — общее для инлайн-поля
// покраски (RichTextField) и вставки смайлика (useNodeEmoji.js) в него.
// Переносы строк в разметке — отдельные <br> (иначе фон подсветки тянется
// через строку), но в самом тексте это обычный символ \n — здесь оба вида
// позиций (DOM и индекс строки) переводятся друг в друга с учётом этого.

// (node, offset) -> индекс в строке. Строим Range от начала контейнера до
// этой точки и считаем длину его содержимого — так корректно обрабатывается
// и позиция внутри текстового узла, и позиция «между детьми» элемента
// (например сразу после <br>), без вручную писанного обхода частных случаев.
// cloneContents() не трогает живой DOM — безопасно вызывать на каждый клик.
export function domToIndex(container, node, offset) {
  if (!container.contains(node) && node !== container) return 0
  const range = document.createRange()
  range.selectNodeContents(container)
  range.setEnd(node, offset)
  return countText(range.cloneContents())
}

function countText(root) {
  let count = 0
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let n
  while ((n = w.nextNode())) {
    if (n.nodeType === Node.TEXT_NODE) count += n.textContent.length
    else if (n.tagName === 'BR') count += 1
  }
  return count
}

// Индекс в строке -> (node, offset), для восстановления каретки после
// программной правки текста (например после применения цвета из тулбара).
export function indexToDom(container, index) {
  const w = document.createTreeWalker(container, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let count = 0, n, last = null
  while ((n = w.nextNode())) {
    if (n.nodeType === Node.TEXT_NODE) {
      const len = n.textContent.length
      if (index <= count + len) return { node: n, offset: index - count }
      count += len
    } else if (n.tagName === 'BR') {
      if (index === count) {
        const parent = n.parentNode
        return { node: parent, offset: [...parent.childNodes].indexOf(n) }
      }
      count += 1
    }
    last = n
  }
  // индекс за пределами содержимого — каретка в самый конец
  if (last?.nodeType === Node.TEXT_NODE) return { node: last, offset: last.textContent.length }
  return { node: container, offset: container.childNodes.length }
}

// Текст контейнера как строка (переносы <br> -> '\n'). Браузер иногда кладёт
// одинокий <br> в пустой сфокусированный contenteditable, чтобы был виден
// курсор — это НЕ реальный перенос строки, трактуем как пустую строку.
export function domToText(container) {
  if (container.childNodes.length === 1 &&
      container.firstChild.nodeType === Node.ELEMENT_NODE &&
      container.firstChild.tagName === 'BR') return ''
  let text = ''
  const w = document.createTreeWalker(container, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let n
  while ((n = w.nextNode())) {
    if (n.nodeType === Node.TEXT_NODE) text += n.textContent
    else if (n.tagName === 'BR') text += '\n'
  }
  return text
}

// Каретка (схлопнутое выделение) внутри контейнера -> индекс, или null, если
// выделение растянуто или находится вне контейнера.
export function readCaretIndex(container) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null
  const r = sel.getRangeAt(0)
  if (!container.contains(r.startContainer)) return null
  return domToIndex(container, r.startContainer, r.startOffset)
}

// Растянутое браузерное выделение внутри контейнера -> {start, end} в
// индексах строки, или null (нет выделения / оно вне контейнера).
export function readSelectionRange(container) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
  const r = sel.getRangeAt(0)
  if (!container.contains(r.commonAncestorContainer)) return null
  const s = domToIndex(container, r.startContainer, r.startOffset)
  const e = domToIndex(container, r.endContainer, r.endOffset)
  return s < e ? { start: s, end: e } : s > e ? { start: e, end: s } : null
}

export function setCaretIndex(container, index) {
  const { node, offset } = indexToDom(container, index)
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
}

export function setSelectionRangeAt(container, start, end) {
  const s = indexToDom(container, start)
  const e = indexToDom(container, end)
  const range = document.createRange()
  range.setStart(s.node, s.offset)
  range.setEnd(e.node, e.offset)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
}
