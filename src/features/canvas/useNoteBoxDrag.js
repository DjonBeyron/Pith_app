import { useCallback } from 'react'
import { applyResize, applyMove } from './noteBoxGeom.js'

// Перетаскивание и растягивание стикера комментария. Экранные пиксели делим
// на масштаб холста: стикер живёт внутри увеличенного/уменьшенного мира, и без
// этого он убегал бы от курсора на любом зуме, кроме 100%.
//
// Первый захват фиксирует текущее положение стикера (offsetLeft/Top/Width/
// Height относительно обёртки ноды) — до этого он стоит на месте по умолчанию,
// координат у него нет вовсе.
export function useNoteBoxDrag({ boxRef, scaleRef, onBoxChange }) {
  const start = useCallback((e, dir) => {
    e.preventDefault()
    e.stopPropagation()
    const el = boxRef.current
    if (!el) return
    const from = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }
    const startX = e.clientX
    const startY = e.clientY

    const onMove = mv => {
      const s = scaleRef?.current ?? 1
      const dx = (mv.clientX - startX) / s
      const dy = (mv.clientY - startY) / s
      onBoxChange(dir === 'move' ? applyMove(from, dx, dy) : applyResize(from, dir, dx, dy))
    }
    const stop = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', stop)
      window.removeEventListener('blur', stop)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', stop)
    window.addEventListener('blur', stop)
  }, [boxRef, scaleRef, onBoxChange])

  return start
}
