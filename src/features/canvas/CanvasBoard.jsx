import { useState, useRef, useEffect, useCallback } from 'react'
import CanvasNode from './CanvasNode.jsx'
import CanvasConnections from './CanvasConnections.jsx'
import { useCanvasDrag } from './useCanvasDrag.js'

const CANVAS_LS = id => `lesson_canvas_${id}`

function makeNode(seq, x, y) {
  return {
    id: crypto.randomUUID(),
    seq,
    x,
    y,
    size: 'max',
    type: 'audio',
    triggers: [{ if: 'played', then: null }],
    typeData: {
      audio:       { file_id: null },
      photo:       { file_id: null, crop: { x: 0, y: 0, scale: 1 } },
      video:       { file_id: null, crop: { x: 0, y: 0, scale: 1 } },
      circle:      { file_id: null, crop: { x: 0, y: 0, scale: 1 } },
      text:        { content: '' },
      word_choice:     { options: [], responseCorrect: '', responseWrong: '' },
      phrase_assembly: { words: [], distractors: [], responseCorrect: '', responseWrong: '' },
      pin_message:     { content: '' },
      system:          { content: '' },
      sticker:         { file_id: null, crop: { x: 0, y: 0, scale: 1 }, muted: true, isVideo: false },
      photo_choice:    { photos: [], correctIndexes: [], responseCorrect: '', responseWrong: '' },
    },
  }
}

function loadSaved(lessonId) {
  if (!lessonId) return {}
  try { return JSON.parse(localStorage.getItem(CANVAS_LS(lessonId)) ?? '{}') } catch { return {} }
}

const NODE_HIT_W = { nano: 42, mini: 182, max: 220 }
const NODE_HIT_H = { nano: 36, mini: 55,  max: 500 }
function nodeAtPos(nodeList, wx, wy, excludeId) {
  return nodeList.find(n => {
    if (n.id === excludeId) return false
    const w = NODE_HIT_W[n.size] ?? 158
    const h = NODE_HIT_H[n.size] ?? 200
    return wx >= n.x && wx <= n.x + w && wy >= n.y && wy <= n.y + h
  })
}

export default function CanvasBoard({
  initialNodes, lessonFiles = [], onPickLessonFile, lessonId, onNodesChange,
}) {
  const [nodes, setNodes] = useState(() => {
    const s = loadSaved(lessonId)
    return s.nodes?.length ? s.nodes : (initialNodes?.length ? initialNodes : [makeNode(1, 120, 80)])
  })
  const [offset, setOffset] = useState(() => loadSaved(lessonId).offset ?? { x: 0, y: 0 })
  const [scale, setScale]   = useState(() => {
    const s = loadSaved(lessonId)
    return typeof s.scale === 'number' ? s.scale : 1
  })
  const [portDrag,       setPortDrag]       = useState(null)
  const [triggerMeasures, setTriggerMeasures] = useState({})
  const [hoveredNodeId,  setHoveredNodeId]  = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  const scaleRef     = useRef(scale)
  const portDragRef  = useRef(null)
  const boardRef     = useRef(null)
  const mountedRef   = useRef(false)
  const hoverTimer   = useRef(null)

  const updateNode = useCallback((id, patch) =>
    setNodes(prev => prev.map(n => n.id === id ? { ...n, ...patch } : n)), [])

  const moveNode = useCallback((id, dx, dy) =>
    setNodes(prev => prev.map(n => n.id === id ? { ...n, x: n.x + dx, y: n.y + dy } : n)), [])

  const pan = useCallback((dx, dy) =>
    setOffset(o => ({ x: o.x + dx, y: o.y + dy })), [])

  const { startNodeDrag, startCanvasDrag, onMouseMove, endDrag, wasDragged } =
    useCanvasDrag({ onNodeMove: moveNode, onPan: pan, scaleRef })

  const handleTriggerMeasure = useCallback((nodeId, offsets) => {
    setTriggerMeasures(prev => {
      const existing = prev[nodeId]
      if (existing && existing.length === offsets.length &&
          existing.every((v, i) => v === offsets[i])) return prev
      return { ...prev, [nodeId]: offsets }
    })
  }, [])

  // Hover with generous delay so cursor can cross the gap between node and menu
  function enterNode(nodeId) {
    clearTimeout(hoverTimer.current)
    setHoveredNodeId(nodeId)
  }
  function leaveNode() {
    // longer delay when confirm dialog is open so it doesn't vanish under the cursor
    const delay = confirmDeleteId ? 3000 : 1200
    hoverTimer.current = setTimeout(() => {
      setHoveredNodeId(null)
    }, delay)
  }

  function deleteNode(nodeId) {
    clearTimeout(hoverTimer.current)
    setHoveredNodeId(null)
    setConfirmDeleteId(null)
    setNodes(prev => {
      const node = prev.find(n => n.id === nodeId)
      if (!node) return prev
      const removedSeq = node.seq
      return prev
        .filter(n => n.id !== nodeId)
        .map(n => ({
          ...n,
          seq: n.seq > removedSeq ? n.seq - 1 : n.seq,
          triggers: n.triggers.map(t => ({ ...t, then: t.then === nodeId ? null : t.then })),
        }))
    })
  }

  function insertAfterNode(nodeId) {
    setNodes(prev => {
      const node = prev.find(n => n.id === nodeId)
      if (!node) return prev
      const insertSeq = node.seq + 1
      const nextNode  = prev.find(n => n.seq === insertSeq) ?? null
      const newNode   = makeNode(insertSeq, node.x + 260, node.y)
      if (nextNode) newNode.triggers = [{ if: 'played', then: nextNode.id }]
      const updated = prev.map(n => {
        let out = n.seq >= insertSeq ? { ...n, seq: n.seq + 1 } : n
        if (n.id === nodeId) {
          if (nextNode) {
            // middle insert: rewire existing trigger A→B to A→new→B
            out = { ...out, triggers: out.triggers.map(t => ({
              ...t, then: t.then === nextNode.id ? newNode.id : t.then,
            }))}
          } else {
            // tail insert: add trigger from clicked node to new node
            out = { ...out, triggers: [...out.triggers, { if: 'played', then: newNode.id }] }
          }
        }
        return out
      })
      return [...updated, newNode]
    })
  }

  function toWorld(clientX, clientY) {
    const rect = boardRef.current.getBoundingClientRect()
    return {
      x: (clientX - rect.left - offset.x) / scale,
      y: (clientY - rect.top  - offset.y) / scale,
    }
  }

  function startPortDrag(fromNodeId, triggerIdx, e) {
    e.stopPropagation()
    const pd = { fromNodeId, triggerIdx, ...toWorld(e.clientX, e.clientY) }
    portDragRef.current = pd
    setPortDrag(pd)
  }

  function handleMouseMove(e) {
    if (portDragRef.current) {
      const pos = toWorld(e.clientX, e.clientY)
      const pd = { ...portDragRef.current, ...pos }
      portDragRef.current = pd
      setPortDrag(pd)
      return
    }
    onMouseMove(e)
  }

  function handleMouseUp(e) {
    if (portDragRef.current) {
      const { fromNodeId, triggerIdx } = portDragRef.current
      const { x, y } = toWorld(e.clientX, e.clientY)
      const hit = nodeAtPos(nodes, x, y, fromNodeId)
      setNodes(prev => prev.map(n =>
        n.id !== fromNodeId ? n : {
          ...n,
          triggers: n.triggers.map((t, i) =>
            i !== triggerIdx ? t : { ...t, then: hit ? hit.id : null }
          ),
        }
      ))
      portDragRef.current = null
      setPortDrag(null)
      return
    }
    endDrag()
  }

  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    function onWheel(e) {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      const cur = scaleRef.current
      const next = Math.min(2.5, Math.max(0.25, cur * factor))
      const rect = el.getBoundingClientRect()
      scaleRef.current = next
      setScale(next)
      setOffset(o => ({
        x: (e.clientX - rect.left) - (next / cur) * ((e.clientX - rect.left) - o.x),
        y: (e.clientY - rect.top)  - (next / cur) * ((e.clientY - rect.top)  - o.y),
      }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    if (!lessonId) return
    if (!mountedRef.current) { mountedRef.current = true; return }
    const t = setTimeout(() =>
      localStorage.setItem(CANVAS_LS(lessonId), JSON.stringify({ nodes, offset, scale })), 400)
    return () => clearTimeout(t)
  }, [lessonId, nodes, offset, scale])

  useEffect(() => {
    if (!onNodesChange) return
    const t = setTimeout(() => onNodesChange(nodes), 500)
    return () => clearTimeout(t)
  }, [nodes, onNodesChange])

  function addNode() {
    const el = boardRef.current
    const rect = el ? el.getBoundingClientRect() : { width: 900, height: 600 }
    const cx = (rect.width  / 2 - offset.x) / scale - 91 + (Math.random() - 0.5) * 60
    const cy = (rect.height / 2 - offset.y) / scale - 20 + (Math.random() - 0.5) * 60
    setNodes(prev => [...prev, makeNode(prev.length + 1, cx, cy)])
  }

  const svgTransform   = `translate(${offset.x},${offset.y}) scale(${scale})`
  const worldTransform = `translate(${offset.x}px,${offset.y}px) scale(${scale})`

  return (
    <div
      ref={boardRef}
      className="canvasBoard"
      style={{ cursor: portDrag ? 'crosshair' : undefined }}
      onMouseDown={startCanvasDrag}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <svg className="canvasBoardSvg canvasBoardSvgBack">
        <g transform={svgTransform}>
          <CanvasConnections
            nodes={nodes} portDrag={portDrag} onPortDragStart={startPortDrag}
            triggerMeasures={triggerMeasures} layer="back"
          />
        </g>
      </svg>

      <div className="canvasBoardWorld" style={{ transform: worldTransform, transformOrigin: '0 0' }}>
        {nodes.map(node => (
          <div
            key={node.id}
            className="canvasNodeWrapper"
            style={{ left: node.x, top: node.y }}
            onMouseEnter={() => enterNode(node.id)}
            onMouseLeave={leaveNode}
          >
            <CanvasNode
              node={node}
              onUpdate={patch => updateNode(node.id, patch)}
              onDragStart={e => startNodeDrag(node.id, e)}
              wasDragged={wasDragged}
              allNodes={nodes}
              lessonFiles={lessonFiles}
              onPickLessonFile={onPickLessonFile}
              onTriggerMeasure={offsets => handleTriggerMeasure(node.id, offsets)}
            />
            {hoveredNodeId === node.id && (
              <div
                className="nodeHoverMenu"
                onMouseEnter={() => enterNode(node.id)}
                onMouseLeave={leaveNode}
                onMouseDown={e => e.stopPropagation()}
              >
                {confirmDeleteId === node.id ? (
                  <>
                    <span className="nodeHoverConfirm">Удалить?</span>
                    <button className="nodeHoverBtn nodeHoverBtnDel"
                      onClick={e => { e.stopPropagation(); deleteNode(node.id) }}>Да</button>
                    <button className="nodeHoverBtn"
                      onClick={e => { e.stopPropagation(); setConfirmDeleteId(null) }}>Нет</button>
                  </>
                ) : (
                  <>
                    <button className="nodeHoverBtn nodeHoverBtnDel"
                      onClick={e => { e.stopPropagation(); setConfirmDeleteId(node.id) }}>×</button>
                    <button className="nodeHoverBtn nodeHoverBtnAdd"
                      onClick={e => { e.stopPropagation(); insertAfterNode(node.id) }}>+</button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <svg className="canvasBoardSvg canvasBoardSvgFront">
        <g transform={svgTransform}>
          <CanvasConnections
            nodes={nodes} portDrag={portDrag} onPortDragStart={startPortDrag}
            triggerMeasures={triggerMeasures} layer="front"
          />
        </g>
      </svg>

      <button className="canvasAddBtn" onClick={addNode}>+ Нода</button>
    </div>
  )
}
