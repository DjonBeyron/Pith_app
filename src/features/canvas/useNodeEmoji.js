import { useState, useRef } from 'react'
import { shiftHighlights } from '../../shared/lib/textHighlight.js'
import { readSelectionRange, readCaretIndex, setCaretIndex } from '../../shared/lib/domTextPosition.js'

// Вставка смайлика в текст ноды. Смайлик встаёт в позицию курсора (или
// заменяет выделенное), а раскраска текста едет вместе с ним: выделения
// хранятся позициями в строке, и без сдвига они «съезжали» бы на соседние
// буквы.
//
// Позицию курсора снимаем в момент открытия окна: оно забирает фокус, и потом
// спросить поле было бы уже не о чем. Поле — всегда contenteditable
// RichTextField (все текстовые поля ноды теперь на нём).
export function useNodeEmoji({ wrapRef, text, field, highlights, onUpdate }) {
  const [rect, setRect] = useState(null)
  const targetRef = useRef(null)

  function open(e) {
    const editable = wrapRef.current?.querySelector('[contenteditable="true"]:focus')
    if (editable) {
      const caret = readCaretIndex(editable) ?? text.length
      const range = readSelectionRange(editable) ?? { start: caret, end: caret }
      targetRef.current = { el: editable, ...range }
    } else {
      targetRef.current = null
    }
    setRect(e.currentTarget.getBoundingClientRect())
  }

  function insert(ch) {
    const t = targetRef.current
    const start = t ? t.start : text.length
    const end   = t ? t.end   : text.length
    const patch = { [field]: text.slice(0, start) + ch + text.slice(end) }
    if (highlights?.length) patch.highlights = shiftHighlights(highlights, start, end, ch.length)
    onUpdate(patch)
    setRect(null)
    if (!t?.el) return
    // Курсор — сразу за вставленным смайликом, чтобы можно было печатать дальше
    const caret = start + ch.length
    requestAnimationFrame(() => { t.el.focus({ preventScroll: true }); setCaretIndex(t.el, caret) })
  }

  return { rect, open, insert, close: () => setRect(null) }
}
