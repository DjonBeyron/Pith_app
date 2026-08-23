import { useState, useRef } from 'react'
import { shiftHighlights } from '../../shared/lib/textHighlight.js'

// Вставка смайлика в текст ноды. Смайлик встаёт в позицию курсора (или
// заменяет выделенное), а раскраска текста едет вместе с ним: выделения
// хранятся позициями в строке, и без сдвига они «съезжали» бы на соседние
// буквы.
//
// Позицию курсора снимаем в момент открытия окна: оно забирает фокус, и потом
// спросить textarea было бы уже не о чем.
export function useNodeEmoji({ wrapRef, text, field, highlights, onUpdate }) {
  const [rect, setRect] = useState(null)
  const targetRef = useRef(null)

  function open(e) {
    const el = wrapRef.current?.querySelector('textarea:focus')
    targetRef.current = (el && el.selectionStart != null)
      ? { el, start: el.selectionStart, end: el.selectionEnd }
      : null
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
    requestAnimationFrame(() => { t.el.focus(); t.el.setSelectionRange(caret, caret) })
  }

  return { rect, open, insert, close: () => setRect(null) }
}
