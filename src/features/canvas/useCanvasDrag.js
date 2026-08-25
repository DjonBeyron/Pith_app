import { useRef, useState, useCallback } from 'react'
import { suppressTextSelection, markDragging, releaseTextSelection } from './canvasDragGuard.js'

// Handles two kinds of drag on the canvas:
//   'node'   — user grabbed a node; fires onNodeMove(id, dx, dy) on each move
//   'canvas' — user grabbed empty space; fires onPan(dx, dy) to scroll the world
//
// scaleRef: ref to current zoom scale — node dx/dy are divided by it so movement
// stays correct at any zoom level. wasDragged() returns true if meaningful movement
// occurred since the last mousedown; node click handlers use it to skip size-cycling.
export function useCanvasDrag({ onNodeMove, onNodeDuplicate, onPan, scaleRef }) {
  const dragRef  = useRef(null)
  const movedRef = useRef(false)
  // Тянут ноду прямо сейчас. Меняется только на границах протяжки (не на
  // каждое движение мыши), зато позволяет отключить на это время тяжёлые
  // пересчёты — подбор обходных маршрутов линий в CanvasConnections
  const [nodeDragging, setNodeDragging] = useState(false)

  // .canvasNode сам по себе user-select:none, но это не спасает от нативного
  // выделения текста, если протяжка началась внутри textarea (у него своё
  // выделение, не подчиняется user-select родителя) — при быстрой протяжке
  // мышь уходит далеко за пределы textarea, и браузер продолжает тянуть
  // выделение по всей странице, задевая текст других нод. На время ЛЮБОЙ
  // протяжки (нода или холст) глушим выделение на всей странице — так же,
  // как уже сделано для протяжки порта (см. CanvasBoard.jsx, portDrag).
  // opts.duplicate — начали протяжку с зажатым Shift: на первом же реальном
  // движении вместо оригинала под курсором окажется его копия (onNodeDuplicate),
  // как копирование файла протяжкой в проводнике
  const startNodeDrag = useCallback((nodeId, e, opts) => {
    e.stopPropagation()
    movedRef.current = false
    dragRef.current = {
      type: 'node', nodeId, duplicate: !!opts?.duplicate,
      startX: e.clientX, startY: e.clientY,
    }
    setNodeDragging(true)
    suppressTextSelection(e)
  }, [])

  const startCanvasDrag = useCallback((e) => {
    movedRef.current = false
    dragRef.current = { type: 'canvas', startX: e.clientX, startY: e.clientY }
    suppressTextSelection(e)
  }, [])

  const onMouseMove = useCallback((e) => {
    let d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
    // Протяжка реально началась — только теперь гасим наведение и клики по
    // содержимому нод. Раньше это делалось по нажатию, и обычный клик по
    // кнопке внутри ноды (например «верный ответ») не доходил до неё.
    if (!movedRef.current) markDragging()
    movedRef.current = true
    if (d.type === 'node') {
      // Копию делаем один раз, на старте движения, и дальше тянем именно её —
      // оригинал остаётся на своём месте
      if (d.duplicate) {
        const copyId = onNodeDuplicate?.(d.nodeId)
        d = { ...d, duplicate: false, nodeId: copyId ?? d.nodeId }
      }
      const s = scaleRef?.current ?? 1
      onNodeMove(d.nodeId, dx / s, dy / s)
    } else {
      onPan(dx, dy)
    }
    dragRef.current = { ...d, startX: e.clientX, startY: e.clientY }
  }, [onNodeMove, onNodeDuplicate, onPan, scaleRef])

  const endDrag = useCallback(() => {
    dragRef.current = null
    setNodeDragging(false)
    releaseTextSelection()
  }, [])

  // useCallback — проп до CanvasNode.jsx (мемоизирован React.memo);
  // нестабильная ссылка срывала бы мемоизацию каждый рендер
  const wasDragged = useCallback(() => movedRef.current, [])

  return { startNodeDrag, startCanvasDrag, onMouseMove, endDrag, wasDragged, nodeDragging }
}
