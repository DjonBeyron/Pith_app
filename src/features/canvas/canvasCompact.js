import { computeSeqMap, NODE_SLOT, NODE_ROW } from './nodeGraph.js'

// Компактная раскладка: граф выкладывается «змейкой» по порядку сценария —
// PER_ROW нод в ряд, дальше следующий ряд.
//
// Зачем: импортированный урок расставляется в одну длинную линию, и полотно
// холста растягивается на десятки тысяч пикселей. По такому графу неудобно
// ходить глазами, а браузер вдобавок перестаёт отрисовывать дальние куски —
// связи «подрезаются» при зуме и движении камеры. После сжатия те же ноды
// занимают экран-два, и всё это уходит.
//
// Порядок берём тот же, что у нумерации (обход по триггерам), поэтому
// цепочка сценария читается слева направо, ряд за рядом.
export const PER_ROW = 6

export function compactLayout(nodes, { perRow = PER_ROW, startX = 120, startY = 80 } = {}) {
  if (!nodes?.length) return nodes
  const seqMap = computeSeqMap(nodes)
  const order = [...nodes].sort((a, b) => (seqMap.get(a.id) ?? 0) - (seqMap.get(b.id) ?? 0))
  const posById = new Map()
  order.forEach((n, i) => {
    posById.set(n.id, {
      x: startX + (i % perRow) * NODE_SLOT,
      y: startY + Math.floor(i / perRow) * NODE_ROW,
    })
  })
  return nodes.map(n => ({ ...n, ...posById.get(n.id) }))
}

// Габариты графа — по ним видно, стоит ли предлагать сжатие
export function graphSize(nodes) {
  if (!nodes?.length) return { w: 0, h: 0 }
  const xs = nodes.map(n => n.x ?? 0)
  const ys = nodes.map(n => n.y ?? 0)
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}
