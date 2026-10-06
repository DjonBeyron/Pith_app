import { createContext, useContext } from 'react'

// Элементы своей ленты для хуков внутри PlayerFeed (окно ленты —
// useFeedWindow.js): { outer: .playerFeed, inner: .playerFeedInner }.
// Через контекст, а не document.querySelector: при двух плеерах разом (слой
// перехода по lesson_ref поверх модуля) поиск по документу находил ленту
// НИЖНЕГО плеера. Значения — DOM-элементы из state PlayerFeed (не ref):
// их можно читать в рендере
export const FeedRefsContext = createContext(null)

export function useFeedEls() {
  return useContext(FeedRefsContext)
}
