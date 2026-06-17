import { useRef, useCallback } from 'react'

// Handles two kinds of drag on the canvas:
//   'node'   — user grabbed a node; fires onNodeMove(id, dx, dy) on each move
//   'canvas' — user grabbed empty space; fires onPan(dx, dy) to scroll the world
//
// wasDragged() returns true if meaningful movement occurred since the last mousedown.
// Node click handlers call it to skip size-cycling after a drag.
export function useCanvasDrag({ onNodeMove, onPan }) {
  const dragRef  = useRef(null)
  const movedRef = useRef(false)

  const startNodeDrag = useCallback((nodeId, e) => {
    e.stopPropagation()
    movedRef.current = false
    dragRef.current = { type: 'node', nodeId, startX: e.clientX, startY: e.clientY }
  }, [])

  const startCanvasDrag = useCallback((e) => {
    movedRef.current = false
    dragRef.current = { type: 'canvas', startX: e.clientX, startY: e.clientY }
  }, [])

  const onMouseMove = useCallback((e) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
    movedRef.current = true
    if (d.type === 'node') onNodeMove(d.nodeId, dx, dy)
    else onPan(dx, dy)
    dragRef.current = { ...d, startX: e.clientX, startY: e.clientY }
  }, [onNodeMove, onPan])

  const endDrag = useCallback(() => {
    dragRef.current = null
  }, [])

  function wasDragged() { return movedRef.current }

  return { startNodeDrag, startCanvasDrag, onMouseMove, endDrag, wasDragged }
}
