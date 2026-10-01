import { useState, useRef, useEffect } from 'react'
import { swipeDecision, dragTransform, LEAVE_TRANSFORM } from './reviewSwipe.js'

// Жест «дальше» для карточки повтора: пока enabled, карточку можно тянуть за
// пальцем/мышью влево — и за саму карточку, и за подсказку «смахни карточку»
// под ней (её тоже тянут). Протянутая достаточно — улетает и зовёт onNext; не
// дотянул — возвращается на место. Решение и строки transform — reviewSwipe.js.
// Без состояния React на каждое движение: за пальцем идёт прямая запись в
// style.transform карточки раз в кадр (requestAnimationFrame) — иначе каждое
// движение перерисовывало всю карточку вместе с плеером внутри. Слушатели —
// на самих элементах. Использование: `const [cardRef, hintRef] = useSwipeNext(…)`,
// cardRef — на карточку, hintRef — на подсказку
const LEAVE_MS = 200
const CAPTURE_PX = 8 // захват указателя только после заметного сдвига — тапы по вложенному не ломаем

export function useSwipeNext(enabled, onNext) {
  const [card, setCard] = useState(null)
  const [hint, setHint] = useState(null)
  const nextRef = useRef(onNext)
  useEffect(() => { nextRef.current = onNext })

  useEffect(() => {
    if (!enabled || !card) return undefined
    const c = { x: 0, y: 0, id: null, dx: 0, dy: 0, raf: 0, captured: false, leaving: false, dragged: false, timer: 0 }
    const paint = () => { c.raf = 0; if (c.id !== null) card.style.transform = dragTransform(c.dx, c.dy) }
    const settle = (transition, transform) => { card.style.transition = transition; card.style.transform = transform }
    const stop = () => { cancelAnimationFrame(c.raf); c.raf = 0; c.id = null }

    const onDown = e => {
      if (!e.isPrimary || c.leaving) return
      Object.assign(c, { x: e.clientX, y: e.clientY, id: e.pointerId, dx: 0, dy: 0, captured: false, dragged: false })
      card.style.transition = 'none'
    }
    const onMove = e => {
      if (c.id !== e.pointerId) return
      c.dx = e.clientX - c.x
      c.dy = e.clientY - c.y
      if (!c.captured && Math.hypot(c.dx, c.dy) > CAPTURE_PX) {
        c.captured = true
        c.dragged = true
        e.currentTarget.setPointerCapture?.(e.pointerId)
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
    // Жест, начатый на подсказке-кнопке, кончается кликом по ней — гасим, иначе «Далее»
    // сработало бы сразу, не дав карточке улететь
    const onClick = e => { if (c.dragged) { e.preventDefault(); e.stopImmediatePropagation(); c.dragged = false } }

    const els = [card, hint].filter(Boolean)
    for (const el of els) {
      el.addEventListener('pointerdown', onDown)
      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerup', onUp)
      el.addEventListener('pointercancel', onCancel)
      el.addEventListener('click', onClick, true)
    }
    return () => {
      for (const el of els) {
        el.removeEventListener('pointerdown', onDown)
        el.removeEventListener('pointermove', onMove)
        el.removeEventListener('pointerup', onUp)
        el.removeEventListener('pointercancel', onCancel)
        el.removeEventListener('click', onClick, true)
      }
      stop()
      clearTimeout(c.timer)
    }
  }, [enabled, card, hint])

  return [setCard, setHint]
}
