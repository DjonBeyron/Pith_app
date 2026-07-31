import { TYPED_PAIRS } from '../canvas/nodeDefaults.js'
import { renumber, NODE_SLOT } from '../canvas/nodeGraph.js'

// «Основной» триггер ноды — тот, что список продакшена считает «следующая
// нода по умолчанию» при перетаскивании строки. Для типов со своей парой
// (word_choice и т.п.) это «верно»/«отправить»-триггер; второй (ветка,
// «неверно») список не трогает — им управляют только явные дропдауны в
// NodeContentEditor/спец-пикерах.
export function getPrimaryTriggerIndex(node) {
  const pair = TYPED_PAIRS[node.type]
  const triggers = node.triggers ?? []
  if (pair) {
    const idx = triggers.findIndex(t => t.if === pair[0])
    return idx >= 0 ? idx : 0
  }
  return 0
}

// Перестраивает основной путь цепочки под переданный порядок нод: у каждой
// ноды её основной триггер начинает указывать на следующую в этом порядке
// (последняя — на null). Ветки (второй триггер пары) не трогает. orderedNodes
// должен содержать РОВНО тот же набор нод, что и исходный список (просто в
// новом порядке) — иначе часть нод потеряет seq при renumber.
//
// Заодно переставляет x/y нод в одну строку по этому же порядку (y=0,
// x=i*NODE_SLOT) — если менять только связи, не трогая позиции, в canvas
// линии-стрелки начинают крест-накрест бегать между старыми местами нод, и
// новый порядок визуально не читается. Меняем порядок из Продакшена — значит
// приоритет у линейного чтения графа, а не у ручной 2D-раскладки в canvas.
export function relinkPrimaryChain(orderedNodes) {
  const relinked = orderedNodes.map((node, i) => {
    const nextId = i < orderedNodes.length - 1 ? orderedNodes[i + 1].id : null
    const idx = getPrimaryTriggerIndex(node)
    const triggers = (node.triggers ?? []).map((t, ti) => (ti === idx ? { ...t, then: nextId } : t))
    return { ...node, triggers, x: i * NODE_SLOT, y: 0 }
  })
  return renumber(relinked)
}

const BRANCH_LABEL = {
  word_wrong: '✗ Неверно',
  phrase_wrong: '✗ Неверно',
  photo_wrong: '✗ Неверно',
  table_wrong: '✗ Неверно',
  reg_cancel: '✕ Отмена',
}
const PRIMARY_LABEL = {
  word_correct: '✓ Верно',
  phrase_correct: '✓ Верно',
  photo_correct: '✓ Верно',
  table_correct: '✓ Верно',
  reg_submit: '✓ Отправить',
}

// Нода, на которую ведёт основной триггер (следующая по умолчанию).
export function getPrimaryTarget(node, allNodes) {
  const idx = getPrimaryTriggerIndex(node)
  const then = node.triggers?.[idx]?.then
  if (!then) return null
  return allNodes.find(n => n.id === then) ?? null
}

// Ветка ноды — «неосновной» триггер с указанной целью (например «неверно»
// у word_choice). Возвращает null, если ветки нет или она никуда не указывает.
export function getBranchTarget(node, allNodes) {
  const primaryIdx = getPrimaryTriggerIndex(node)
  const branch = (node.triggers ?? []).find((t, i) => i !== primaryIdx && t.then)
  if (!branch) return null
  const target = allNodes.find(n => n.id === branch.then)
  if (!target) return null
  return { target, label: BRANCH_LABEL[branch.if] ?? '↳ Ветка' }
}

// Строит план рендера списка: обычно каждая нода — своя строка («single»),
// но у ноды с развилкой (getBranchTarget) следующая по основному пути и
// нода-цель ветки идут ПАРОЙ («pair», делят экран пополам) сразу под ней —
// каждая нода рисуется РОВНО один раз, поэтому цель ветки, показанная в
// паре, дальше по списку пропускается (visited).
export function buildRenderPlan(sorted, allNodes) {
  const visited = new Set()
  const plan = []
  sorted.forEach(node => {
    if (visited.has(node.id)) return
    const branch = getBranchTarget(node, allNodes)
    const primary = branch ? getPrimaryTarget(node, allNodes) : null
    if (branch && primary && primary.id !== node.id && !visited.has(primary.id) && !visited.has(branch.target.id)) {
      plan.push({ type: 'single', node })
      const primaryIfIdx = getPrimaryTriggerIndex(node)
      const primaryLabel = PRIMARY_LABEL[node.triggers?.[primaryIfIdx]?.if] ?? '✓ Далее'
      plan.push({ type: 'pair', left: primary, leftLabel: primaryLabel, right: branch.target, rightLabel: branch.label })
      visited.add(primary.id)
      visited.add(branch.target.id)
      return
    }
    plan.push({ type: 'single', node })
  })
  return plan
}

// Вставляет newNode СРАЗУ ПОСЛЕ конкретной ноды afterId — патчит только
// основной триггер этой ноды, ничего больше. Не пересобирает связи всего
// массива (в отличие от relinkPrimaryChain): у ноды с развилкой соседние по
// seq ноды могут принадлежать СОВСЕМ другой ветке (DFS сначала обходит весь
// путь «верно», потом «неверно») — relinkPrimaryChain по всему списку в
// этом случае перепутал бы, к какой ветке цепляется новая нода.
export function insertNodeAfter(nodes, afterId, newNode) {
  const afterNode = nodes.find(n => n.id === afterId)
  if (!afterNode) return nodes
  const afterIdx = getPrimaryTriggerIndex(afterNode)
  const prevNext = afterNode.triggers?.[afterIdx]?.then ?? null
  const newIdx = getPrimaryTriggerIndex(newNode)
  const patchedNew = {
    ...newNode,
    triggers: (newNode.triggers ?? []).map((t, i) => (i === newIdx ? { ...t, then: prevNext } : t)),
  }
  const patchedNodes = nodes.map(n => (n.id === afterId
    ? { ...n, triggers: n.triggers.map((t, i) => (i === afterIdx ? { ...t, then: patchedNew.id } : t)) }
    : n))
  return renumber([...patchedNodes, patchedNew])
}

// Вставляет newNode СРАЗУ ПЕРЕД конкретной нодой beforeId: у newNode основной
// триггер указывает на beforeId, а все триггеры графа, которые раньше вели
// на beforeId (обычно один — родитель), теперь ведут на newNode. Если ни
// один триггер на beforeId не вёл (она была корнем) — newNode сама станет
// новым корнем, ничего больше патчить не нужно.
export function insertNodeBefore(nodes, beforeId, newNode) {
  const newIdx = getPrimaryTriggerIndex(newNode)
  const patchedNew = {
    ...newNode,
    triggers: (newNode.triggers ?? []).map((t, i) => (i === newIdx ? { ...t, then: beforeId } : t)),
  }
  const patchedNodes = nodes.map(n => ({
    ...n,
    triggers: n.triggers.map(t => (t.then === beforeId ? { ...t, then: patchedNew.id } : t)),
  }))
  return renumber([...patchedNodes, patchedNew])
}

// Вставляет newNode самым первым (новым корнем графа): текущий корень
// (нода без входящих триггеров) становится вторым — на него указывает
// основной триггер newNode.
export function insertNodeAtStart(nodes, newNode) {
  const incoming = new Set()
  nodes.forEach(n => (n.triggers ?? []).forEach(t => { if (t.then) incoming.add(t.then) }))
  const root = nodes.find(n => !incoming.has(n.id))
  const newIdx = getPrimaryTriggerIndex(newNode)
  const patchedNew = root
    ? { ...newNode, triggers: newNode.triggers.map((t, i) => (i === newIdx ? { ...t, then: root.id } : t)) }
    : newNode
  return renumber([...nodes, patchedNew])
}
