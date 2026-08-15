// Чистые операции над выделением нод. Вынесены из useCanvasSelection, чтобы
// их можно было проверить тестами и чтобы сам хук держал только состояние.

// Shift+клик: нода добавляется в выделение или убирается из него
export function toggleSelection(selected, nodeId) {
  const next = new Set(selected)
  if (next.has(nodeId)) next.delete(nodeId)
  else next.add(nodeId)
  return next
}

// Кого двигать при протяжке за ноду: всю группу, если нода входит в
// выделение из 2+ нод, иначе только её саму
export function moveGroupFor(selected, nodeId) {
  return selected.has(nodeId) && selected.size > 1 ? selected : new Set([nodeId])
}

// Ноды, попавшие в рамку. hitSize(node) → {w, h} — хит-бокс по размеру ноды
export function nodesInMarquee(nodes, a, b, hitSize) {
  const left = Math.min(a.x, b.x), right = Math.max(a.x, b.x)
  const top  = Math.min(a.y, b.y), bottom = Math.max(a.y, b.y)
  return nodes.filter(n => {
    const { w, h } = hitSize(n)
    return n.x < right && n.x + w > left && n.y < bottom && n.y + h > top
  }).map(n => n.id)
}
