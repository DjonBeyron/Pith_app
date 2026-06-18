function seededRand(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  return Math.abs(Math.sin(h) * 43758.5453) % 1
}

// Adaptive bezier:
//   target to the right  → forward S-curve
//   target left / same x → arc loops to the right side
function neuronPath(x1, y1, x2, y2, seed) {
  const dx = x2 - x1, dy = y2 - y1, w = 22
  if (dx > 50) {
    const h = Math.max(dx * 0.45, 60)
    const cp1x = x1 + h + (seededRand(seed + 'a') - 0.5) * w
    const cp1y = y1 + dy * 0.25 + (seededRand(seed + 'b') - 0.5) * w * 0.5
    const cp2x = x2 - h + (seededRand(seed + 'c') - 0.5) * w
    const cp2y = y2 - dy * 0.25 + (seededRand(seed + 'd') - 0.5) * w * 0.5
    return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`
  }
  const bulge = Math.max(120, Math.abs(dy) * 0.5)
  const cp1x = x1 + bulge + (seededRand(seed + 'a') - 0.5) * w
  const cp1y = y1 + dy * 0.2 + (seededRand(seed + 'b') - 0.5) * w * 0.5
  const cp2x = x2 + bulge + (seededRand(seed + 'c') - 0.5) * w
  const cp2y = y2 - dy * 0.2 + (seededRand(seed + 'd') - 0.5) * w * 0.5
  return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`
}

// CSS-fallback constants (used before first DOM measurement on max nodes)
const TRIGGER_Y_BASE = { audio: 132, text: 102, photo: 352, video: 352, circle: 352 }
const TRIGGER_ROW_STRIDE = 54
const THEN_Y_FALLBACK = 28
// Dot sits 8px outside node edge (max only); mini/nano lines go 5px inside the node body
const PORT_OFFSET  = 8
const INNER_OFFSET = 5
const NODE_W = { nano: 42, mini: 182, max: 220 }

// y-center of trigger i's "Тогда" line for MAX nodes only.
// triggerMeasures is ignored for mini/nano to prevent stale data after size change.
function getThenY(node, i, triggerMeasures) {
  const m = triggerMeasures[node.id]
  if (m?.[i] != null) return node.y + m[i]
  const base = TRIGGER_Y_BASE[node.type] ?? TRIGGER_Y_BASE.audio
  return node.y + base + i * TRIGGER_ROW_STRIDE + THEN_Y_FALLBACK
}

// Output: right side of node.
//   max  → 8px outside right edge at exact "Тогда" y (dot visible)
//   mini/nano → 5px inside right edge at node center (line hidden under node body)
function triggerAnchor(node, i, triggerMeasures) {
  const w = NODE_W[node.size] ?? 192
  if (node.size !== 'max') {
    return { x: node.x + w - INNER_OFFSET, y: node.y + 18 }
  }
  return { x: node.x + w + PORT_OFFSET, y: getThenY(node, i, triggerMeasures) }
}

// Input: left side of node.
//   max  → 8px outside left edge at exact "Тогда" y of first trigger (dot visible)
//   mini/nano → 5px inside left edge at node center (line hidden under node body)
function nodeEntry(node, triggerMeasures) {
  if (node.size !== 'max') {
    return { x: node.x + INNER_OFFSET, y: node.y + 18 }
  }
  return { x: node.x - PORT_OFFSET, y: getThenY(node, 0, triggerMeasures) }
}

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
    </>
  )
}
