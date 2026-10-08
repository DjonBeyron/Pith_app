import { useRef } from 'react'

// Свайп вниз по карточке попапа закрывает его. Карточка едет за пальцем
// напрямую через style (без перерисовок React); потянули дальше порога —
// уезжает вниз и зовём onClose('swipe'), меньше — возвращается на место.
// Только transform, лёгкий.
const THRESHOLD = 70

// → [ref для карточки, обработчики касаний]
export function useSwipeClose(onClose) {
  const ref = useRef(null)
  const start = useRef(null)

  const setY = (y, animate) => {
    const el = ref.current
    if (!el) return
    el.style.transition = animate ? 'transform 0.18s ease-out' : 'none'
    el.style.transform = y ? `translateY(${y}px)` : ''
  }

  const handlers = {
    // прокрученная карточка (на очень низком экране) свайпом не закрывается
    onTouchStart: e => { start.current = (ref.current?.scrollTop ?? 0) > 0 ? null : { y: e.touches[0].clientY, dy: 0 } },
    onTouchMove: e => {
      const s = start.current
      if (!s) return
      s.dy = Math.max(0, e.touches[0].clientY - s.y)
      if (s.dy > 0) setY(s.dy, false)
    },
    onTouchEnd: () => {
      const s = start.current
      start.current = null
      if (!s) return
      if (s.dy > THRESHOLD) { setY(window.innerHeight * 0.5, true); onClose('swipe') }
      else setY(0, true)
    },
    onTouchCancel: () => { start.current = null; setY(0, true) },
  }
  return [ref, handlers]
}
