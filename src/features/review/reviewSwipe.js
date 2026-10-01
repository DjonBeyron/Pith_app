// Смахивание карточки повторения после ответа (PROJECT.md → «Формат
// повторения»): только ВЛЕВО. Жест «назад» Safari идёт от левого края вправо,
// с нашим не пересекается. Чистые функции без DOM: решение по смещению и
// строки transform для карточки — их ставит useSwipeNext напрямую в стиль.

export const SWIPE_PX = 70  // сколько протянуть влево, чтобы засчиталось

// dx/dy — смещение от начала жеста → 'left' | null. Диагональ решает большая ось
export function swipeDecision({ dx, dy }) {
  return -dx >= SWIPE_PX && Math.abs(dy) < -dx ? 'left' : null
}

// Тянут: карточка едет только влево (вправо — стоит), по вертикали лишь слегка
// следует за пальцем; чуть наклоняется. translate3d — слой на видеокарте
export function dragTransform(dx, dy) {
  const x = Math.min(0, dx)
  return `translate3d(${x}px, ${Math.round(dy * 0.3)}px, 0) rotate(${(x / 40).toFixed(2)}deg)`
}

// Улетает за левый край экрана
export const LEAVE_TRANSFORM = 'translate3d(-115%, 0, 0) rotate(-8deg)'
