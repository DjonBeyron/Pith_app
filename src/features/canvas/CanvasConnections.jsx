import { triggerAnchor, nodeEntry } from './canvasPorts.js'

function seededRand(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  return Math.abs(Math.sin(h) * 43758.5453) % 1
}

// Adaptive bezier — two cases based on canvas-space node direction.
// Output port is +228px right of its node; input port is -8px left of its node.
// So two max-nodes side by side will have port dx ≈ -236 + node_gap.
// "Forward" (target node to the right): x2 > x1 - 240  → compact S-curve, shortest path.
// "Backward" (target node clearly left):                → rightward loop.
function neuronPath(x1, y1, x2, y2, seed) {
  const dx = x2 - x1, dy = y2 - y1
  const jit = (s, m) => (seededRand(s) - 0.5) * m

  if (x2 > x1 - 240) {
    // Forward connection: S-curve scaled to actual port distance, minimum spread 40px.
    // Keeps the line short — no unnecessary arcs when nodes are close.
    const h = Math.max(Math.abs(dx) * 0.4, 40)
    return `M ${x1} ${y1} C ${x1+h+jit(seed+'a',10)} ${y1+dy*.3+jit(seed+'b',8)}, ${x2-h+jit(seed+'c',10)} ${y2-dy*.3+jit(seed+'d',8)}, ${x2} ${y2}`
  }

  // Backward connection: loop rightward, size ∝ distance
  const dist = Math.sqrt(dx*dx + dy*dy)
  const bulge = Math.max(dist * 0.5, 100)
  return `M ${x1} ${y1} C ${x1+bulge+jit(seed+'a',12)} ${y1+dy*.15+jit(seed+'b',8)}, ${x2+bulge+jit(seed+'c',12)} ${y2-dy*.15+jit(seed+'d',8)}, ${x2} ${y2}`
}

// Радиус зоны срабатывания входной точки при перетаскивании порта —
// синхронизирован со SNAP_R в CanvasBoard.
const DROP_R = 40

// layer='back'  → lines only (behind nodes, z-index 0)
// layer='front' → dots only (in front of nodes, z-index 2)
export default function CanvasConnections({
  nodes, portDrag, onPortDragStart, triggerMeasures = {}, layer,
}) {
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]))

  const lines = nodes.flatMap(node =>
    (node.triggers ?? []).map((t, i) => {
      if (!t.then) return null
      if (portDrag?.fromNodeId === node.id && portDrag?.triggerIdx === i) return null
      const toNode = byId[t.then]
      if (!toNode) return null
      const from = triggerAnchor(node, i, triggerMeasures)
      const to   = nodeEntry(toNode, triggerMeasures)
      const key  = `${node.id}:${i}`
      return { key, d: neuronPath(from.x, from.y, to.x, to.y, key), to, toSize: toNode.size, fromNodeId: node.id, triggerIdx: i }
    }).filter(Boolean)
  )

  const ghost = (() => {
    if (!portDrag) return null
    const fromNode = byId[portDrag.fromNodeId]
    if (!fromNode) return null
    const from = triggerAnchor(fromNode, portDrag.triggerIdx, triggerMeasures)
    return neuronPath(from.x, from.y, portDrag.x, portDrag.y, 'ghost')
  })()

  // ── back layer: only lines ─────────────────────────────────────────
  if (layer === 'back') {
    return (
      <>
        {lines.map(({ key, d }) => (
          <g key={key}>
            <path d={d} stroke="#b6fe3b" strokeWidth="7" fill="none" opacity="0.08" />
            <path d={d} stroke="#b6fe3b" strokeWidth="1.5" fill="none" opacity="0.75" />
          </g>
        ))}
        {ghost && (
          <path d={ghost} stroke="#b6fe3b" strokeWidth="1.5" fill="none"
            opacity="0.45" strokeDasharray="6 4" />
        )}
      </>
    )
  }

  // ── front layer: dots only ─────────────────────────────────────────
  // Output dots: right of each trigger row in MAX nodes (always visible)
  const outDots = nodes.flatMap(node =>
    node.size !== 'max' ? [] :
    (node.triggers ?? []).map((_, i) => {
      const pos = triggerAnchor(node, i, triggerMeasures)
      const isDragging = portDrag?.fromNodeId === node.id && portDrag?.triggerIdx === i
      return (
        <g key={`out:${node.id}:${i}`} className="portDot"
          onMouseDown={e => { e.stopPropagation(); onPortDragStart?.(node.id, i, e) }}>
          <circle cx={pos.x} cy={pos.y} r={10} fill="transparent" />
          <circle className="portDotInner" cx={pos.x} cy={pos.y} r={5}
            fill={isDragging ? '#fff' : '#b6fe3b'} stroke="#090b0e" strokeWidth="2"
            opacity={isDragging ? 0.3 : 1} />
        </g>
      )
    })
  )

  // Static input dots: left of MAX nodes with triggers (always visible)
  const inDots = nodes
    .filter(n => n.size === 'max' && (n.triggers ?? []).length > 0)
    .map(node => {
      const pos = nodeEntry(node, triggerMeasures)
      return (
        <circle key={`in:${node.id}`} cx={pos.x} cy={pos.y} r={4}
          fill="#b6fe3b" stroke="#090b0e" strokeWidth="1.5" opacity="0.5" />
      )
    })

  // Во время перетаскивания порта: входные точки всех нод-кандидатов
  // пульсируют; та, что в радиусе броска, — крупнее и чаще (готова принять)
  const dropTargets = portDrag ? nodes
    .filter(n => n.id !== portDrag.fromNodeId)
    .map(node => {
      const pos  = nodeEntry(node, triggerMeasures)
      const near = Math.hypot(portDrag.x - pos.x, portDrag.y - pos.y) <= DROP_R
      return (
        <circle
          key={`drop:${node.id}`}
          className={`portDropPulse${near ? ' portDropPulse--near' : ''}`}
          cx={pos.x} cy={pos.y} r={near ? 11 : 6}
          fill="#b6fe3b" stroke="#090b0e" strokeWidth="2"
        />
      )
    }) : null

  // Draggable input dots per active connection — only shown on MAX targets (for reconnect)
  const connInDots = lines
    .filter(l => l.toSize === 'max')
    .map(({ key, to, fromNodeId, triggerIdx }) => (
      <g key={`cin:${key}`} className="portDot"
        onMouseDown={e => { e.stopPropagation(); onPortDragStart?.(fromNodeId, triggerIdx, e) }}>
        <circle cx={to.x} cy={to.y} r={10} fill="transparent" />
        <circle className="portDotInner" cx={to.x} cy={to.y} r={5}
          fill="#b6fe3b" stroke="#090b0e" strokeWidth="2" />
      </g>
    ))

  return (
    <>
      {inDots}
      {connInDots}
      {outDots}
      {dropTargets}
    </>
  )
}
