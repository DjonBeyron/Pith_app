// Геометрия портов нод канваса: где находятся выходные точки триггеров и
// входная точка ноды. Используется CanvasConnections (отрисовка точек/линий)
// и CanvasBoard (зона примагничивания при броске порта).

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
export function triggerAnchor(node, i, triggerMeasures) {
  const w = NODE_W[node.size] ?? 192
  if (node.size !== 'max') {
    return { x: node.x + w - INNER_OFFSET, y: node.y + 18 }
  }
  return { x: node.x + w + PORT_OFFSET, y: getThenY(node, i, triggerMeasures) }
}

// Input: left side of node.
//   max  → 8px outside left edge at exact "Тогда" y of first trigger (dot visible)
//   mini/nano → 5px inside left edge at node center (line hidden under node body)
export function nodeEntry(node, triggerMeasures) {
  if (node.size !== 'max') {
    return { x: node.x + INNER_OFFSET, y: node.y + 18 }
  }
  return { x: node.x - PORT_OFFSET, y: getThenY(node, 0, triggerMeasures) }
}
