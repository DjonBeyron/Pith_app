// Смахивание карточки повторения после ответа (PROJECT.md → «Формат
// повторения»: вверх или вправо, не от левого края — там жест «назад» Safari).
// Чистые функции без DOM: решение по смещению и стиль карточки на лету.

export const EDGE_PX = 24   // старт ближе к левому краю экрана — не наш жест
export const SWIPE_PX = 70  // сколько протянуть, чтобы засчиталось

// startX — где начался жест (от левого края экрана); dx/dy — смещение.
// → 'right' | 'up' | null
export function swipeDecision({ startX, dx, dy }) {
  if (startX < EDGE_PX) return null
  if (dx >= SWIPE_PX && Math.abs(dy) < dx) return 'right'
  if (-dy >= SWIPE_PX && Math.abs(dx) < -dy) return 'up'
  return null
}

// drag: null | { dx, dy } (тянут) | { leave: 'right' | 'up' } (улетает)
export function swipeStyle(drag) {
  if (!drag) return undefined
  if (drag.leave === 'right') return { transform: 'translateX(115%) rotate(8deg)', transition: 'transform 0.2s ease-in' }
  if (drag.leave === 'up') return { transform: 'translateY(-115%)', transition: 'transform 0.2s ease-in' }
  // Тянуть можно только в «нашу» сторону: влево и вниз карточка не едет
  const dx = Math.max(0, drag.dx), dy = Math.min(0, drag.dy)
  return { transform: `translate(${dx}px, ${dy}px) rotate(${dx / 40}deg)`, transition: 'none' }
}
