import { useState, useCallback } from 'react'
import CanvasNode from './CanvasNode.jsx'
import CanvasConnections from './CanvasConnections.jsx'
import { useCanvasDrag } from './useCanvasDrag.js'

function makeNode(seq) {
  return {
    id: crypto.randomUUID(),
    seq,
    x: 40 + Math.random() * 200,
    y: 60 + Math.random() * 140,
    size: 'nano',
    type: 'audio',
    triggers: [],
  }
}

// connections prop: [{ from: id, to: id }] — empty for now, wired in Stage 4
export default function CanvasBoard({ initialNodes, connections = [] }) {
  const [nodes, setNodes] = useState(() =>
    initialNodes?.length ? initialNodes : [makeNode(1)]
  )
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  const updateNode = useCallback((id, patch) =>
    setNodes(prev => prev.map(n => n.id === id ? { ...n, ...patch } : n)),
  [])

  const moveNode = useCallback((id, dx, dy) =>
    setNodes(prev => prev.map(n => n.id === id ? { ...n, x: n.x + dx, y: n.y + dy } : n)),
  [])

  const pan = useCallback((dx, dy) =>
    setOffset(o => ({ x: o.x + dx, y: o.y + dy })),
  [])

  const { startNodeDrag, startCanvasDrag, onMouseMove, endDrag, wasDragged } =
    useCanvasDrag({ onNodeMove: moveNode, onPan: pan })

  function addNode() {
    setNodes(prev => [...prev, makeNode(prev.length + 1)])
  }

  return (
    <div
      className="canvasBoard"
      onMouseDown={startCanvasDrag}
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
    >
      {/* SVG layer — connections drawn below nodes, pointer-events off */}
      <svg className="canvasBoardSvg">
        <g transform={`translate(${offset.x},${offset.y})`}>
          <CanvasConnections connections={connections} nodes={nodes} />
        </g>
      </svg>

      {/* Node layer — transforms with canvas offset */}
      <div
        className="canvasBoardWorld"
        style={{ transform: `translate(${offset.x}px,${offset.y}px)` }}
      >
        {nodes.map(node => (
          <div
            key={node.id}
            className="canvasNodeWrapper"
            style={{ left: node.x, top: node.y }}
          >
            <CanvasNode
              node={node}
              onUpdate={patch => updateNode(node.id, patch)}
              onDragStart={e => startNodeDrag(node.id, e)}
              wasDragged={wasDragged}
            />
          </div>
        ))}
      </div>

      <button className="canvasAddBtn" onClick={addNode}>+ Нода</button>
    </div>
  )
}
