import { TYPED_PAIRS } from '../canvas/nodeDefaults.js'
import { renumber } from '../canvas/nodeGraph.js'

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
export function relinkPrimaryChain(orderedNodes) {
  const relinked = orderedNodes.map((node, i) => {
    const nextId = i < orderedNodes.length - 1 ? orderedNodes[i + 1].id : null
    const idx = getPrimaryTriggerIndex(node)
    const triggers = (node.triggers ?? []).map((t, ti) => (ti === idx ? { ...t, then: nextId } : t))
    return { ...node, triggers }
  })
  return renumber(relinked)
}
