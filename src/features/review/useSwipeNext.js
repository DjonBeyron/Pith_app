import { useRef, useState } from 'react'
import { swipeDecision, swipeStyle } from './reviewSwipe.js'

// Жест «дальше» для карточки повторения: пока enabled, карточка тянется за
// пальцем/мышью, протянутая вверх или вправо улетает и зовёт onNext.
// Не дотянул — возвращается на место. Решение — reviewSwipe.js
const LEAVE_MS = 200

export function useSwipeNext(enabled, onNext) {
  const startRef = useRef(null)
  const [drag, setDrag] = useState(null)

  if (!enabled) return { handlers: {}, style: undefined }

  const handlers = {
    onPointerDown(e) {
      if (!e.isPrimary || drag?.leave) return
      startRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    },
    onPointerMove(e) {
      const s = startRef.current
      if (!s || s.id !== e.pointerId) return
      setDrag({ dx: e.clientX - s.x, dy: e.clientY - s.y })
    },
    onPointerUp(e) {
      const s = startRef.current
      startRef.current = null
      if (!s || s.id !== e.pointerId) return
      const dir = swipeDecision({ startX: s.x, dx: e.clientX - s.x, dy: e.clientY - s.y })
      if (!dir) { setDrag(null); return }
      setDrag({ leave: dir })
      setTimeout(onNext, LEAVE_MS)
    },
    onPointerCancel() { startRef.current = null; setDrag(d => (d?.leave ? d : null)) },
  }
  return { handlers, style: swipeStyle(drag) }
}
