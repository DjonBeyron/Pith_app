import { useRef, useState } from 'react'

function readPos(key) {
  if (!key) return null
  try {
    const p = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null
    return { x: Math.min(Math.max(0, p.x), window.innerWidth - 40), y: Math.min(Math.max(0, p.y), window.innerHeight - 40) }
  } catch { return null }
}

// Перетаскивание дебаг-панели/кнопки пальцем или мышью. pos===null — элемент
// сидит на дефолтном месте из CSS; после первого перетаскивания позиция
// фиксируется инлайн-стилем (left/top) и держится, пока панель не закроют.
// Pointer Events сами покрывают тач на телефоне — отдельных touch-хендлеров
// не нужно.
// storageKey — запомнить позицию в localStorage (скипер нод: окно стоит там, куда его поставили, и после перезагрузки)
export function useDraggablePosition(elRef, { storageKey = null } = {}) {
  const [pos, setPos] = useState(() => readPos(storageKey))
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
    if (storageKey && pos) { try { localStorage.setItem(storageKey, JSON.stringify(pos)) } catch { /* нет хранилища */ } }
  }

  const style = pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined
  const dragHandleProps = { onPointerDown, onPointerMove, onPointerUp, style: { touchAction: 'none' } }
  return { style, dragHandleProps }
}
