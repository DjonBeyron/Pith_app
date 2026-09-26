import { useRef, useEffect, useCallback } from 'react'

// Геометрия доски канваса: ref самой доски и кэш её прямоугольника (от него
// считаются координаты мыши при протяжках и зуме). Вынесено из
// CanvasBoard.jsx (тот упирался в потолок 400 строк)
export function useBoardRect() {
  const boardRef     = useRef(null)
  // Кэш getBoundingClientRect() холста: сам вызов форсирует layout, а на
  // колесе и протяжке он летел бы на каждое событие. Обновляется на resize,
  // и дополнительно перед каждой протяжкой — см. measureBoard ниже
  const boardRectRef = useRef({ left: 0, top: 0 })

  // Пересчёт кэша прямоугольника доски. Нужен не только на resize: доска
  // может СДВИНУТЬСЯ без изменения размера (появилась строка статуса,
  // страница прокрутилась) — ResizeObserver такого не замечает, а координаты
  // мыши считаются именно от него, и протяжка порта уезжает мимо курсора
  const measureBoard = useCallback(() => {
    const el = boardRef.current
    if (el) boardRectRef.current = el.getBoundingClientRect()
  }, [])

  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    function measure() { boardRectRef.current = el.getBoundingClientRect() }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [])

  return { boardRef, boardRectRef, measureBoard }
}
