import { useState, useRef, useEffect } from 'react'
import { swipeDecision, dragTransform, LEAVE_TRANSFORM } from './reviewSwipe.js'

// Жест «дальше» для карточки повтора: пока enabled, карточка тянется за
// пальцем/мышью влево, протянутая достаточно — улетает и зовёт onNext. Не
// дотянул — возвращается на место. Решение и строки transform — reviewSwipe.js.
// Без состояния React на каждое движение: за пальцем идёт прямая запись в
// style.transform раз в кадр (requestAnimationFrame) — иначе каждое движение
// перерисовывало всю карточку вместе с плеером внутри. Слушатели — на самом
// элементе. Использование: `ref={useSwipeNext(enabled, onNext)}` на карточке
const LEAVE_MS = 200
const CAPTURE_PX = 8 // захват указателя только после заметного сдвига — тапы по вложенному не ломаем

export function useSwipeNext(enabled, onNext) {
  const [el, setEl] = useState(null)
  const nextRef = useRef(onNext)
  useEffect(() => { nextRef.current = onNext })

  useEffect(() => {
    if (!enabled || !el) return undefined
    const c = { x: 0, y: 0, id: null, dx: 0, dy: 0, raf: 0, captured: false, leaving: false, timer: 0 }
    const paint = () => { c.raf = 0; if (c.id !== null) el.style.transform = dragTransform(c.dx, c.dy) }
    const settle = (transition, transform) => { el.style.transition = transition; el.style.transform = transform }
    const stop = () => { cancelAnimationFrame(c.raf); c.raf = 0; c.id = null }

    const onDown = e => {
      if (!e.isPrimary || c.leaving) return
      Object.assign(c, { x: e.clientX, y: e.clientY, id: e.pointerId, dx: 0, dy: 0, captured: false })
      el.style.transition = 'none'
    }
    const onMove = e => {
      if (c.id !== e.pointerId) return
      c.dx = e.clientX - c.x
      c.dy = e.clientY - c.y
      if (!c.captured && Math.hypot(c.dx, c.dy) > CAPTURE_PX) {
        c.captured = true
        el.setPointerCapture?.(e.pointerId)
      }
      if (!c.raf) c.raf = requestAnimationFrame(paint)
    }
    const onUp = e => {
      if (c.id !== e.pointerId) return
      stop()
      if (swipeDecision({ dx: e.clientX - c.x, dy: e.clientY - c.y })) {
        c.leaving = true
        settle(`transform ${LEAVE_MS}ms ease-in`, LEAVE_TRANSFORM)
        c.timer = setTimeout(() => nextRef.current(), LEAVE_MS)
      } else {
        settle('transform 0.2s ease-out', '')
      }
    }
    const onCancel = () => { stop(); if (!c.leaving) settle('transform 0.2s ease-out', '') }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancel)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onCancel)
      stop()
      clearTimeout(c.timer)
    }
  }, [enabled, el])

  return setEl
}
