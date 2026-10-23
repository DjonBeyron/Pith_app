import { useRef, useState, useEffect, useCallback } from 'react'

// Геометрия доски канваса: ref самой доски и кэш её прямоугольника (от него
// считаются координаты мыши при протяжках и зуме). Вынесено из
// CanvasBoard.jsx (тот упирался в потолок 400 строк)
export function useBoardRect() {
  const boardRef     = useRef(null)
  // Кэш getBoundingClientRect() холста: сам вызов форсирует layout, а на
  // колесе и протяжке он летел бы на каждое событие. Обновляется на resize,
  // и дополнительно перед каждой протяжкой — см. measureBoard ниже
  const boardRectRef = useRef({ left: 0, top: 0 })
  // Размер доски как состояние — по нему useVisibleNodes решает, какие ноды в кадре (до первого замера — размер окна)
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))

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
    function measure() {
      const r = el.getBoundingClientRect()
      boardRectRef.current = r
      if (r.width && r.height) setSize(prev => (prev.w === r.width && prev.h === r.height ? prev : { w: r.width, h: r.height }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [])

  return { boardRef, boardRectRef, measureBoard, boardSize: size }
}
