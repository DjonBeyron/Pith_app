import { useRef, useState } from 'react'

// Перетаскивание дебаг-панели/кнопки пальцем или мышью. pos===null — элемент
// сидит на дефолтном месте из CSS; после первого перетаскивания позиция
// фиксируется инлайн-стилем (left/top) и держится, пока панель не закроют.
// Pointer Events сами покрывают тач на телефоне — отдельных touch-хендлеров
// не нужно.
export function useDraggablePosition(elRef) {
  const [pos, setPos] = useState(null)
  const dragState = useRef(null)

  function onPointerDown(e) {
    const rect = elRef.current?.getBoundingClientRect()
    if (!rect) return
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: pos?.x ?? rect.left,
      originY: pos?.y ?? rect.top,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e) {
    const d = dragState.current
    if (!d) return
    const el = elRef.current
    const maxX = window.innerWidth - (el?.offsetWidth ?? 40)
    const maxY = window.innerHeight - (el?.offsetHeight ?? 40)
    setPos({
      x: Math.min(Math.max(0, d.originX + (e.clientX - d.startX)), Math.max(0, maxX)),
      y: Math.min(Math.max(0, d.originY + (e.clientY - d.startY)), Math.max(0, maxY)),
    })
  }

  function onPointerUp() {
    dragState.current = null
  }

  const style = pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined
  const dragHandleProps = { onPointerDown, onPointerMove, onPointerUp, style: { touchAction: 'none' } }
  return { style, dragHandleProps }
}
