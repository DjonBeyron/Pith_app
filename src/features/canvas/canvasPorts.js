// Геометрия портов нод канваса: где находятся выходные точки триггеров и
// входная точка ноды. Используется CanvasConnections (отрисовка точек/линий)
// и CanvasBoard (зона примагничивания при броске порта).

// CSS-fallback constants (used before first DOM measurement on max nodes)
const TRIGGER_Y_BASE = { audio: 132, text: 102, photo: 352, video: 352, circle: 352 }
const TRIGGER_ROW_STRIDE = 54
const THEN_Y_FALLBACK = 28
// Порты — на 8px снаружи от края ноды (для всех размеров)
const PORT_OFFSET = 8
const NODE_W = { nano: 42, mini: 182, max: 220 }

// y-center of trigger i's "Тогда" line for MAX nodes only.
// triggerMeasures is ignored for mini/nano to prevent stale data after size change.
function getThenY(node, i, triggerMeasures) {
  const m = triggerMeasures[node.id]
  if (m?.[i] != null) return node.y + m[i]
  const base = TRIGGER_Y_BASE[node.type] ?? TRIGGER_Y_BASE.audio
  return node.y + base + i * TRIGGER_ROW_STRIDE + THEN_Y_FALLBACK
}

// Высоты свёрнутых нод (CSS) и запас под шапку/низ max-ноды
const NODE_H = { nano: 42, mini: 52 }
const MAX_TAIL = 46

// Output: right side of node, 8px outside the edge.
//   max  → at exact "Тогда" y (dot visible)
//   mini/nano → at node center; конец линии виден снаружи, а не под телом
export function triggerAnchor(node, i, triggerMeasures) {
  const w = NODE_W[node.size] ?? 192
  if (node.size !== 'max') {
    return { x: node.x + w + PORT_OFFSET, y: node.y + 18 }
  }
  return { x: node.x + w + PORT_OFFSET, y: getThenY(node, i, triggerMeasures) }
}

// Input: left side of node, 8px outside the edge — точка входа всегда снаружи,
// иначе конец связи прячется под телом ноды и не видно, куда она приходит
export function nodeEntry(node, triggerMeasures) {
  if (node.size !== 'max') {
    return { x: node.x - PORT_OFFSET, y: node.y + 18 }
  }
  return { x: node.x - PORT_OFFSET, y: getThenY(node, 0, triggerMeasures) }
}

// Прямоугольник тела ноды в координатах холста — препятствие для линий.
// Высота max-ноды переменная: берём последнюю измеренную строку «Тогда»
// плюс хвост, до первого замера — расчёт по тем же CSS-константам.
export function nodeBox(node, triggerMeasures = {}) {
  const w = NODE_W[node.size] ?? 192
  let h = NODE_H[node.size]
  if (h == null) {
    const m = triggerMeasures[node.id]
    const last = m?.length ? m[m.length - 1] : null
    if (last != null) {
      h = last + MAX_TAIL
    } else {
      const n = node.triggers?.length ?? 1
      const base = TRIGGER_Y_BASE[node.type] ?? TRIGGER_Y_BASE.audio
      h = base + (n - 1) * TRIGGER_ROW_STRIDE + THEN_Y_FALLBACK + MAX_TAIL
    }
  }
  return { left: node.x, top: node.y, right: node.x + w, bottom: node.y + h }
}
