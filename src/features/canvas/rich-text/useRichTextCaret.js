import { useLayoutEffect } from 'react'
import { setCaretIndex, setSelectionRangeAt } from '../../../shared/lib/domTextPosition.js'

// HighlightedText перерисовывает спаны заново почти на каждую правку (цвет/
// декорации меняют границы кусков) — нативная каретка (и выделение) браузера
// при этом теряется. Этот эффект возвращает её на нужное место сразу после
// того, как React закоммитил новый DOM.
//
// pendingCaretRef — число (просто каретка, после печати/Enter/вставки) или
// {start,end} (после покраски тулбаром: нужно вернуть именно ВЫДЕЛЕНИЕ, а не
// схлопнутую каретку — иначе тулбар решит, что выделение снято, и закроется
// после первого же клика по кнопке).
export function useRichTextCaret(ref, pendingCaretRef, value, highlights) {
  useLayoutEffect(() => {
    const el = ref.current
    const pending = pendingCaretRef.current
    if (!el || pending == null || document.activeElement !== el) return
    if (typeof pending === 'number') setCaretIndex(el, pending)
    else setSelectionRangeAt(el, pending.start, pending.end)
    pendingCaretRef.current = null
  }, [ref, pendingCaretRef, value, highlights])
}
