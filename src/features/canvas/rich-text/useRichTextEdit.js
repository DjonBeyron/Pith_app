import { diffTextEdit } from '../../../shared/lib/textEditDiff.js'
import { domToText, readCaretIndex, readSelectionRange } from '../../../shared/lib/domTextPosition.js'
import { shiftHighlights, addHighlight, removeRange, rangeHasStyle } from '../../../shared/lib/textHighlight.js'

// Двигатель правки RichTextField. Обычный ввод (печать/Backspace/Delete/IME/
// автозамена) идёт через onInput: читаем текст и каретку из живого DOM ПОСЛЕ
// того, как браузер уже сам его поправил, и восстанавливаем {start,end,
// insertedLength} диффом (та же функция, что чинит textarea-поля в Шаге 0) —
// дальше raскраска сдвигается тем же shiftHighlights.
//
// Вставка и Enter — НЕ через диф: browser по умолчанию вставляет отформатиро-
// ванный HTML при paste и создаёт <div>/лишний <br> на Enter, что ломает
// модель «текст + диапазоны». Тут позиция вставки известна точно (текущая
// каретка/выделение), поэтому правим текст напрямую, без диффинга.
export function useRichTextEdit({ ref, value, highlights, onChange, pendingCaretRef }) {
  function commit(newText, newHighlights, caret) {
    pendingCaretRef.current = caret
    onChange({ value: newText, highlights: newHighlights })
  }

  function currentRange() {
    const el = ref.current
    if (!el) return null
    const sel = readSelectionRange(el)
    if (sel) return sel
    const caret = readCaretIndex(el)
    return caret == null ? null : { start: caret, end: caret }
  }

  function spliceAt(start, end, insert) {
    return value.slice(0, start) + insert + value.slice(end)
  }

  function onInput() {
    const el = ref.current
    if (!el) return
    const newText = domToText(el)
    const postCaret = readCaretIndex(el)
    const { start, end, insertedLength } = diffTextEdit(value, newText, postCaret)
    commit(newText, shiftHighlights(highlights, start, end, insertedLength), postCaret ?? newText.length)
  }

  function onPaste(e) {
    e.preventDefault()
    const text = e.clipboardData?.getData('text/plain') ?? ''
    if (!text) return
    const range = currentRange()
    if (!range) return
    commit(
      spliceAt(range.start, range.end, text),
      shiftHighlights(highlights, range.start, range.end, text.length),
      range.start + text.length,
    )
  }

  function toggleDecor(mode) {
    const range = currentRange()
    if (!range || range.start === range.end) return
    const has = rangeHasStyle(highlights, range.start, range.end, mode)
    const next = has
      ? removeRange(highlights, range.start, range.end, mode)
      : addHighlight(highlights, { start: range.start, end: range.end, mode })
    // Выделение возвращаем целиком (не просто каретку) — Ctrl+B/Ctrl+U можно
    // жать подряд по одному и тому же куску, не выделяя его заново каждый раз
    pendingCaretRef.current = range
    onChange({ value, highlights: next })
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const range = currentRange()
      if (!range) return
      commit(
        spliceAt(range.start, range.end, '\n'),
        shiftHighlights(highlights, range.start, range.end, 1),
        range.start + 1,
      )
      return
    }
    const mod = e.ctrlKey || e.metaKey
    if (!mod) return
    if (e.key === 'b' || e.key === 'B') { e.preventDefault(); toggleDecor('bold') }
    else if (e.key === 'u' || e.key === 'U') { e.preventDefault(); toggleDecor('underline') }
    else if (e.key === 'i' || e.key === 'I') { e.preventDefault(); toggleDecor('italic') }
  }

  return { onInput, onPaste, onKeyDown }
}
