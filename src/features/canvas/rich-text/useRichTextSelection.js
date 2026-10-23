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
    const sel = el?.ownerDocument.defaultView.getSelection()
    if (!el || !sel || sel.rangeCount === 0 || sel.isCollapsed || !el.contains(sel.anchorNode)) return
    const range = readSelectionRange(el)
    if (!range) return
    setState({ range, rect: sel.getRangeAt(0).getBoundingClientRect() })
  }, [ref])

  const hideIfInvalid = useCallback(() => {
    const el = ref.current
    const sel = el?.ownerDocument.defaultView.getSelection()
    if (!el || !sel || sel.rangeCount === 0 || sel.isCollapsed || !el.contains(sel.anchorNode)) setState(null)
  }, [ref])

  // Слушатели на документе вешаем только пока поле в фокусе: на холсте их сотни, и каждый selectionchange/mouseup будил бы все поля сразу
  // (≈85 мс только на открытие «Разбора»). Выделение в поле всегда начинается с фокуса в нём (мышь, клавиатура, ручки выделения на телефоне)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const doc = el.ownerDocument // поле может жить в отдельном окне (usePopupWindow) — слушаем его документ
    let on = false
    const attach = () => {
      if (on) return
      on = true
      doc.addEventListener('mouseup', captureIfValid)
      doc.addEventListener('selectionchange', hideIfInvalid)
    }
    const detach = () => {
      if (!on) return
      on = false
      doc.removeEventListener('mouseup', captureIfValid)
      doc.removeEventListener('selectionchange', hideIfInvalid)
    }
    const onFocusOut = e => {
      if (!e.relatedTarget || !el.contains(e.relatedTarget)) detach()
    }
    el.addEventListener('keyup', captureIfValid)
    el.addEventListener('focusin', attach)
    el.addEventListener('focusout', onFocusOut)
    if (el.contains(doc.activeElement)) attach()
    return () => {
      detach()
      el.removeEventListener('keyup', captureIfValid)
      el.removeEventListener('focusin', attach)
      el.removeEventListener('focusout', onFocusOut)
    }
  }, [ref, captureIfValid, hideIfInvalid])

  return { range: state?.range ?? null, rect: state?.rect ?? null, hide: () => setState(null) }
}
