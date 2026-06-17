import { useState, useRef, useEffect, useCallback } from 'react'
import CanvasNode from './CanvasNode.jsx'
import CanvasConnections from './CanvasConnections.jsx'
import { useCanvasDrag } from './useCanvasDrag.js'

const CANVAS_LS = id => `lesson_canvas_${id}`

function makeNode(seq) {
  return {
    id: crypto.randomUUID(),
    seq,
    x: 40 + Math.random() * 200,
    y: 60 + Math.random() * 140,
    size: 'mini',
    type: 'audio',
    file_id: null,
    triggers: [],
  }
}

// Load saved canvas state from localStorage (synchronous, used in lazy useState inits).
function loadSaved(lessonId) {
  if (!lessonId) return {}
  try { return JSON.parse(localStorage.getItem(CANVAS_LS(lessonId)) ?? '{}') } catch { return {} }
}

// connections prop: [{ from: id, to: id }] — empty for now, wired in Stage 4
export default function CanvasBoard({
  initialNodes, connections = [], lessonFiles = [], onPickLessonFile, lessonId,
}) {
  // Lazy initializers read localStorage once at mount — no effect needed for load.
  const [nodes, setNodes] = useState(() => {
    const s = loadSaved(lessonId)
    return s.nodes?.length ? s.nodes : (initialNodes?.length ? initialNodes : [makeNode(1)])
  })
  const [offset, setOffset] = useState(() => loadSaved(lessonId).offset ?? { x: 0, y: 0 })
  const [scale, setScale] = useState(() => {
    const s = loadSaved(lessonId)
    return typeof s.scale === 'number' ? s.scale : 1
  })
  // scaleRef mirrors scale for wheel handler (avoids stale closure)
  const scaleRef  = useRef(scale)
  const boardRef  = useRef(null)
  const mountedRef = useRef(false) // skips autosave on the first render

  const updateNode = useCallback((id, patch) =>
    setNodes(prev => prev.map(n => n.id === id ? { ...n, ...patch } : n)), [])

  const moveNode = useCallback((id, dx, dy) =>
    setNodes(prev => prev.map(n => n.id === id ? { ...n, x: n.x + dx, y: n.y + dy } : n)), [])

  const pan = useCallback((dx, dy) =>
    setOffset(o => ({ x: o.x + dx, y: o.y + dy })), [])

  const { startNodeDrag, startCanvasDrag, onMouseMove, endDrag, wasDragged } =
    useCanvasDrag({ onNodeMove: moveNode, onPan: pan, scaleRef })

  // Wheel zoom toward cursor (passive:false so preventDefault works)
  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    function onWheel(e) {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      const cur = scaleRef.current
      const next = Math.min(2.5, Math.max(0.25, cur * factor))
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      scaleRef.current = next
      setScale(next)
      setOffset(o => ({
        x: mx - (next / cur) * (mx - o.x),
        y: my - (next / cur) * (my - o.y),
      }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Autosave nodes + canvas state to localStorage (debounced, skips initial render)
  useEffect(() => {
    if (!lessonId) return
    if (!mountedRef.current) { mountedRef.current = true; return }
    const t = setTimeout(() => {
      localStorage.setItem(CANVAS_LS(lessonId), JSON.stringify({ nodes, offset, scale }))
    }, 400)
    return () => clearTimeout(t)
  }, [lessonId, nodes, offset, scale])

  function addNode() {
    setNodes(prev => [...prev, makeNode(prev.length + 1)])
  }

  const transform = `translate(${offset.x}px,${offset.y}px) scale(${scale})`

  return (
    <div
      ref={boardRef}
      className="canvasBoard"
      onMouseDown={startCanvasDrag}
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
    >
      <svg className="canvasBoardSvg">
        <g transform={`translate(${offset.x},${offset.y}) scale(${scale})`}>
          <CanvasConnections connections={connections} nodes={nodes} />
        </g>
      </svg>

      <div className="canvasBoardWorld" style={{ transform, transformOrigin: '0 0' }}>
        {nodes.map(node => (
          <div key={node.id} className="canvasNodeWrapper" style={{ left: node.x, top: node.y }}>
            <CanvasNode
              node={node}
              onUpdate={patch => updateNode(node.id, patch)}
              onDragStart={e => startNodeDrag(node.id, e)}
              wasDragged={wasDragged}
              allNodes={nodes}
              lessonFiles={lessonFiles}
              onPickLessonFile={onPickLessonFile}
            />
          </div>
        ))}
      </div>

      <button className="canvasAddBtn" onClick={addNode}>+ Нода</button>
    </div>
  )
}
