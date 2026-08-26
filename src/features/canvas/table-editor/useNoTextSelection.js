import { useEffect } from 'react'

// Тотальный запрет выделения текста внутри узла (кроме полей ввода).
//
// Одного CSS user-select мало: выделение успевает начаться на элементах, где
// протяжка мышью — это работа (названия дорожек, подписи линейки, тело клипа),
// и тогда браузер тянет выделение через всю страницу, а mouseup уходит в него
// — клип оставался «прилипшим» к курсору. selectstart рубит это на корню.
export function useNoTextSelection(ref) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    function onSelectStart(e) {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return
      e.preventDefault()
    }
    el.addEventListener('selectstart', onSelectStart)
    return () => el.removeEventListener('selectstart', onSelectStart)
  }, [ref])
}
