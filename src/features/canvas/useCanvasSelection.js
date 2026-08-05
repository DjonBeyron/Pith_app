import { useState, useRef } from 'react'

// Выделение нескольких нод в canvas: рамкой по левой кнопке над пустым
// местом, или Shift+клик по одной ноде за раз. Протяжка любой ноды из
// текущего выделения (2+) двигает всю группу — см. moveGroup, используется
// в CanvasBoard.jsx moveNode. Вынесено из CanvasBoard.jsx отдельным хуком —
// логика самодостаточна и в основном файле только раздувала бы размер.
export function useCanvasSelection() {
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  // Рамка — экранные координаты относительно boardRef, пока тянется
  const [marquee, setMarquee] = useState(null)
  // Нода, на которую нажали БЕЗ Shift, уже входя в текущее групповое
  // выделение: если протяжки не было (просто клик) — схлопываем выделение
  // до неё одной (как в большинстве графических редакторов)
  const pendingCollapseRef = useRef(null)
  // Снимок выделения на момент начала протяжки рамки — Shift+рамка
  // ДОБАВЛЯЕТ пересечённые ноды к нему, а не заменяет выделение целиком
  const marqueeBaseRef = useRef(new Set())

  function moveGroup(id) {
    return selectedIds.has(id) && selectedIds.size > 1 ? selectedIds : new Set([id])
  }

  // Средняя кнопка мыши — всегда панорамирование, даже если начали над
  // нодой. Левая: Shift+клик добавляет/убирает ноду из выделения; клик по
  // уже выделенной ноде откладывает схлопывание до mouseup (collapseIfClick)
  function onNodeMouseDown(nodeId, e, { startNodeDrag, startCanvasDrag }) {
    if (e.button === 1) {
      e.preventDefault()
      e.stopPropagation()
      startCanvasDrag(e)
      return
    }
    if (e.button !== 0) return
    e.stopPropagation()
    if (e.shiftKey) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        if (next.has(nodeId)) next.delete(nodeId)
        else next.add(nodeId)
        return next
      })
      return
    }
    if (selectedIds.has(nodeId)) {
      pendingCollapseRef.current = nodeId
    } else {
      pendingCollapseRef.current = null
      setSelectedIds(new Set([nodeId]))
    }
    startNodeDrag(nodeId, e)
  }

  function startMarquee(e, boardRef) {
    const rect = boardRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    marqueeBaseRef.current = e.shiftKey ? new Set(selectedIds) : new Set()
    if (!e.shiftKey) setSelectedIds(new Set())
    setMarquee({ x0: x, y0: y, x1: x, y1: y })
  }

  // toWorld(clientX, clientY) — из CanvasBoard (учитывает offset/scale).
  // hitSize(node) → {w,h} — хит-бокс ноды (NODE_HIT_W/H в CanvasBoard.jsx)
  function updateMarquee(e, boardRef, toWorld, nodes, hitSize) {
    if (!marquee) return false
    const rect = boardRef.current.getBoundingClientRect()
    const x1 = e.clientX - rect.left
    const y1 = e.clientY - rect.top
    setMarquee(m => ({ ...m, x1, y1 }))
    const a = toWorld(rect.left + Math.min(marquee.x0, x1), rect.top + Math.min(marquee.y0, y1))
    const b = toWorld(rect.left + Math.max(marquee.x0, x1), rect.top + Math.max(marquee.y0, y1))
    const hitIds = nodes.filter(n => {
      const { w, h } = hitSize(n)
      return n.x < b.x && n.x + w > a.x && n.y < b.y && n.y + h > a.y
    }).map(n => n.id)
    setSelectedIds(new Set([...marqueeBaseRef.current, ...hitIds]))
    return true
  }

  function endMarquee() {
    if (!marquee) return false
    setMarquee(null)
    return true
  }

  // Клик (без протяжки) по уже выделенной группе — схлопываем выделение до
  // этой одной ноды; если была протяжка — группа двигалась, оставляем как есть
  function collapseIfClick(wasDragged) {
    if (pendingCollapseRef.current && !wasDragged()) {
      setSelectedIds(new Set([pendingCollapseRef.current]))
    }
    pendingCollapseRef.current = null
  }

  return {
    selectedIds, marquee, moveGroup,
    onNodeMouseDown, startMarquee, updateMarquee, endMarquee, collapseIfClick,
  }
}
