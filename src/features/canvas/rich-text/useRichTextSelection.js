import { useEffect, useState, useCallback } from 'react'
import { readSelectionRange } from '../../../shared/lib/domTextPosition.js'

// Тулбар должен появляться уже НА ГОТОВОМ выделении, а не гнаться за курсором
// во время протяжки мышью: если обновлять позицию на каждый native
// selectionchange (он летит десятками раз в секунду, пока тянешь мышь),
// панель дёргается по экрану следом за курсором — снаружи это выглядит как
// «панель можно таскать куда угодно». Поэтому рект/позицию берём только на
// mouseup (мышь) и keyup (Shift+стрелки) — когда жест завершён; а
// selectionchange используем ТОЛЬКО чтобы сразу спрятать тулбар, если
// выделение схлопнулось/ушло из поля (иначе он завис бы над пустым местом).
export function useRichTextSelection(ref) {
  const [state, setState] = useState(null) // { range: {start,end}, rect } | null

  const captureIfValid = useCallback(() => {
    const el = ref.current
    const sel = window.getSelection()
    if (!el || !sel || sel.rangeCount === 0 || sel.isCollapsed || !el.contains(sel.anchorNode)) return
    const range = readSelectionRange(el)
    if (!range) return
    setState({ range, rect: sel.getRangeAt(0).getBoundingClientRect() })
  }, [ref])

  const hideIfInvalid = useCallback(() => {
    const el = ref.current
    const sel = window.getSelection()
    if (!el || !sel || sel.rangeCount === 0 || sel.isCollapsed || !el.contains(sel.anchorNode)) setState(null)
  }, [ref])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    document.addEventListener('mouseup', captureIfValid)
    el.addEventListener('keyup', captureIfValid)
    document.addEventListener('selectionchange', hideIfInvalid)
    return () => {
      document.removeEventListener('mouseup', captureIfValid)
      el.removeEventListener('keyup', captureIfValid)
      document.removeEventListener('selectionchange', hideIfInvalid)
    }
  }, [ref, captureIfValid, hideIfInvalid])

  return { range: state?.range ?? null, rect: state?.rect ?? null, hide: () => setState(null) }
}
