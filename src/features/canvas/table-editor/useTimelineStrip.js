import { useState, useRef, useLayoutEffect } from 'react'
import { startDragSession } from './timelineDrag.js'

// Геометрия плейхеда таймлайна: где полоса дорожек относительно контейнера и
// какой она ширины. Полоса тянется по свободному месту (flex:1 при
// min-width), поэтому её реальная ширина бывает больше stripPx — линия
// плейхеда и время протяжки за флажок считаются по ИЗМЕРЕННОЙ полосе, иначе
// плейхед убегал от курсора. Общее для таймлайна таблицы и тренажёра.
export function useTimelineStrip({ stripPx, duration, currentTime, onSeek }) {
  const stripRef = useRef(null)
  const innerRef = useRef(null)
  const [strip, setStrip] = useState({ left: 120, width: 0 })

  useLayoutEffect(() => {
    const s = stripRef.current
    const inner = innerRef.current
    if (!s || !inner) return
    const measure = () => {
      const sb = s.getBoundingClientRect()
      const ib = inner.getBoundingClientRect()
      const next = { left: sb.left - ib.left, width: sb.width }
      setStrip(prev => (prev.left === next.left && prev.width === next.width ? prev : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(s)
    ro.observe(inner)
    return () => ro.disconnect()
  }, [stripPx])

  function timeAtX(clientX) {
    const rect = stripRef.current?.getBoundingClientRect()
    if (!rect?.width) return 0
    return Math.max(0, Math.min(duration, ((clientX - rect.left) / rect.width) * duration))
  }

  // Протяжка за сам плейхед (флажок или линию)
  function startCursorDrag(e) {
    e.preventDefault()
    e.stopPropagation()
    startDragSession(mv => onSeek(timeAtX(mv.clientX)))
  }

  const cursorLeftPx = strip.width ? strip.left + (currentTime / duration) * strip.width : 0

  return { stripRef, innerRef, cursorLeftPx, startCursorDrag }
}
