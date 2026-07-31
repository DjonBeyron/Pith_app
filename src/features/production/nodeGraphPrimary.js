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

// Ветка ноды — «неосновной» триггер с указанной целью (например «неверно»
// у word_choice). Список показывает её как отдельную колонку сбоку от
// основной строки — полноэкранный режим позволяет видеть развилку сразу,
// не переключаясь на canvas. Возвращает null, если ветки нет или она никуда
// не указывает.
export function getBranchTarget(node, allNodes) {
  const primaryIdx = getPrimaryTriggerIndex(node)
  const branch = (node.triggers ?? []).find((t, i) => i !== primaryIdx && t.then)
  if (!branch) return null
  const target = allNodes.find(n => n.id === branch.then)
  if (!target) return null
  return { target, label: BRANCH_LABEL[branch.if] ?? '↳ Ветка' }
}

// Короткий текстовый превью содержимого ноды — для карточки ветки (не для
// редактирования, только чтобы узнать ноду не открывая её).
export function previewNodeText(node) {
  const tData = node?.typeData?.[node.type] ?? {}
  const raw = tData.content ?? tData.text ?? ''
  return raw ? raw.slice(0, 60) : ''
}
