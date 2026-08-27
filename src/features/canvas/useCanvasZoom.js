import { useEffect, useCallback } from 'react'
import { clampScale, wheelZoomFactor, zoomAtPoint } from './canvasZoom.js'

// Колесо/пинч над холстом. Вся арифметика — в canvasZoom.js, здесь только
// подписка на событие и свежий прямоугольник доски: кэшированный (он же нужен
// протяжке) мог устареть — доска сдвигается, когда появляется строка статуса
// или меняется высота шапки, — и тогда зум уезжал мимо курсора.
export function useCanvasZoom(boardRef, boardRectRef, scaleRef, setScale, setOffset) {
  const zoomTo = useCallback((next, px, py) => {
    const cur = scaleRef.current
    if (next === cur) return
    scaleRef.current = next
    setScale(next)
    setOffset(o => zoomAtPoint(o, cur, next, px, py))
  }, [scaleRef, setScale, setOffset])

  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    function onWheel(e) {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      boardRectRef.current = rect
      zoomTo(clampScale(scaleRef.current * wheelZoomFactor(e)),
        e.clientX - rect.left, e.clientY - rect.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [boardRef, boardRectRef, scaleRef, zoomTo])

  // Кнопка «100%»: центр доски остаётся на месте, чтобы после сброса смотреть
  // на тот же кусок урока, а не искать его заново
  return useCallback(() => {
    const el = boardRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    zoomTo(1, rect.width / 2, rect.height / 2)
  }, [boardRef, zoomTo])
}
