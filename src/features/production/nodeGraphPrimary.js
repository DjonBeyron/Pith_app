import { TYPED_PAIRS } from '../canvas/nodeDefaults.js'
import { renumber, NODE_SLOT } from '../canvas/nodeGraph.js'
import { getVariantList } from '../canvas/nodeVariants.js'

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

// Индекс «неосновного» (ветка «неверно»/«отмена») триггера пары — явный
// поиск по if, а не «первый не по основному индексу»: с особыми триггерами
// вариантов ответа (nodeVariants.js) в массиве triggers может быть 3+
// записей, «первый не primary» мог бы случайно попасть на вариант.
export function getBranchTriggerIndex(node) {
  const pair = TYPED_PAIRS[node.type]
  const triggers = node.triggers ?? []
  if (pair) {
    const idx = triggers.findIndex(t => t.if === pair[1])
    return idx >= 0 ? idx : 1
  }
  return -1
}

// Варианты «к какому исходу присоединить» для кнопки «Добавить ноду ниже» —
// по ТИПУ ноды (TYPED_PAIRS), а не по тому, заполнены ли уже обе связи.
// Иначе у только что созданного модуля (обе связи ещё null, пары снизу нет)
// кнопка молча цепляла бы к «верно», не спросив — сюрприз для админа.
// null — у типа нет своей пары (played/timer), спрашивать нечего.
// variants — варианты ответа (word_choice/photo_choice/phrase_assembly/table)
// БЕЗ уже заданного особого перехода: у них есть свой персональный триггер
// (nodeVariants.js), который замещает верно/неверно именно для этого
// варианта — кнопка «ниже» может присоединить новую ноду прямо к нему.
export function getBranchChoices(node) {
  const pair = TYPED_PAIRS[node.type]
  if (!pair) return null
  const primaryIdx = getPrimaryTriggerIndex(node)
  const branchIdx = getBranchTriggerIndex(node)
  const primaryLabel = PRIMARY_LABEL[node.triggers?.[primaryIdx]?.if] ?? '✓ Далее'
  const branchLabel = BRANCH_LABEL[node.triggers?.[branchIdx]?.if] ?? '↳ Ветка'
  const variantList = getVariantList(node.type, node.typeData?.[node.type] ?? {})
  const variants = variantList
    .filter(v => !(node.triggers ?? []).find(t => t.if === v.id)?.then)
    .map(v => ({ value: `variant:${v.id}`, label: `↳ ${v.label}` }))
  return {
    primary: { value: 'primary', label: primaryLabel },
    branch: { value: 'branch', label: branchLabel },
    variants,
  }
}

// Живые продолжения ноды с развилкой (верно/неверно/особые переходы
// вариантов, у каждого из которых УЖЕ задана цель) — колонки для fan-рендера
// в продакшене. null, если у типа нет своей пары исходов или живых
// продолжений меньше двух (тогда рисуем обычную одиночную строку).
export function getFanColumns(node, allNodes) {
  const pair = TYPED_PAIRS[node.type]
  if (!pair) return null
  const cols = []
  const primaryIdx = getPrimaryTriggerIndex(node)
  const primaryThen = node.triggers?.[primaryIdx]?.then
  if (primaryThen) {
    const target = allNodes.find(n => n.id === primaryThen)
    if (target) cols.push({ key: 'primary', node: target, label: PRIMARY_LABEL[node.triggers[primaryIdx].if] ?? '✓ Далее' })
  }
  const branchIdx = getBranchTriggerIndex(node)
  const branchThen = branchIdx >= 0 ? node.triggers?.[branchIdx]?.then : null
  if (branchThen) {
    const target = allNodes.find(n => n.id === branchThen)
    if (target) cols.push({ key: 'branch', node: target, label: BRANCH_LABEL[node.triggers[branchIdx].if] ?? '↳ Ветка' })
  }
  const variantList = getVariantList(node.type, node.typeData?.[node.type] ?? {})
  variantList.forEach(v => {
    const then = (node.triggers ?? []).find(t => t.if === v.id)?.then
    if (!then) return
    const target = allNodes.find(n => n.id === then)
    if (target) cols.push({ key: v.id, node: target, label: `↳ ${v.label}` })
  })
  const ids = cols.map(c => c.node.id)
  if (cols.length < 2 || new Set(ids).size !== ids.length || ids.includes(node.id)) return null
  return cols
}

// Строит план рендера списка: обычно каждая нода — своя строка («single»),
// но у ноды с развилкой (getFanColumns) все живые исходы (верно/неверно и
// особые переходы вариантов с уже заданной целью) идут В РЯД («fan», N
// колонок) сразу под ней. Пока у ВСЕХ колонок есть простое продолжение (не
// ещё одна развилка) — ряд продолжается вниз ещё одним рядом колонок
// (каждая колонка растёт своей веткой на всю длину цепочки, а не разъезжается
// в общий список после первого шага). Останавливается, когда: у какой-то
// колонки нет продолжения; несколько колонок сошлись в одну и ту же ноду
// (insertNodeAfterBoth — дальше это уже общий single); либо сама колонка —
// ещё одна развилка (вложенные развилки не разворачиваем автоматически,
// ограничение v1, её обработает обычный проход по sorted). Каждая нода
// рисуется РОВНО один раз.
export function buildRenderPlan(sorted, allNodes) {
  const visited = new Set()
  const plan = []
  sorted.forEach(node => {
    if (visited.has(node.id)) return
    const cols = getFanColumns(node, allNodes)
    if (cols && cols.every(c => !visited.has(c.node.id))) {
      plan.push({ type: 'single', node, branchChoices: getBranchChoices(node) })
      cols.forEach(c => visited.add(c.node.id))

      let current = cols
      while (true) {
        plan.push({ type: 'fan', columns: current })
        if (current.some(c => getBranchChoices(c.node))) break
        const nextCols = current.map(c => ({ ...c, node: getPrimaryTarget(c.node, allNodes) }))
        if (nextCols.some(c => !c.node)) break
        const nextIds = nextCols.map(c => c.node.id)
        if (new Set(nextIds).size !== nextIds.length) break
        if (nextIds.some(id => visited.has(id))) break
        nextCols.forEach(c => visited.add(c.node.id))
        current = nextCols
      }
      return
    }
    // Fan снизу ещё нет (живых исходов меньше двух), но у типа своя пара
    // исходов (TYPED_PAIRS) — кнопка «ниже» всё равно должна спросить, а не
    // молча цеплять к «верно»
    plan.push({ type: 'single', node, branchChoices: getBranchChoices(node) })
  })
  return plan
}

// Вставляет newNode СРАЗУ ПОСЛЕ конкретной ноды afterId — патчит только один
// триггер этой ноды (по умолчанию основной, но можно явно указать triggerIdx —
// например «ветку», см. getBranchTriggerIndex), ничего больше. Не пересобирает
// связи всего массива (в отличие от relinkPrimaryChain): у ноды с развилкой
// соседние по seq ноды могут принадлежать СОВСЕМ другой ветке (DFS сначала
// обходит весь путь «верно», потом «неверно») — relinkPrimaryChain по всему
// списку в этом случае перепутал бы, к какой ветке цепляется новая нода.
export function insertNodeAfter(nodes, afterId, newNode, triggerIdx) {
  const afterNode = nodes.find(n => n.id === afterId)
  if (!afterNode) return nodes
  const afterIdx = triggerIdx ?? getPrimaryTriggerIndex(afterNode)
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

// Вставляет newNode как точку схождения ДВУХ веток: основной триггер и
// leftId, и rightId начинает указывать на неё (кнопка «между Верно и
// Неверно» — независимо от ответа урок продолжается одним и тем же
// сообщением). Прежние цели leftId/rightId (если были) осиротеют — как и у
// insertNodeAfter, единого «куда» у слияния двух путей нет, так что дальше
// новую ноду соединяют вручную, если нужно.
export function insertNodeAfterBoth(nodes, leftId, rightId, newNode) {
  const leftNode  = nodes.find(n => n.id === leftId)
  const rightNode = nodes.find(n => n.id === rightId)
  if (!leftNode || !rightNode) return nodes
  const leftIdx  = getPrimaryTriggerIndex(leftNode)
  const rightIdx = getPrimaryTriggerIndex(rightNode)
  const patchedNodes = nodes.map(n => {
    if (n.id === leftId) return { ...n, triggers: n.triggers.map((t, i) => (i === leftIdx ? { ...t, then: newNode.id } : t)) }
    if (n.id === rightId) return { ...n, triggers: n.triggers.map((t, i) => (i === rightIdx ? { ...t, then: newNode.id } : t)) }
    return n
  })
  return renumber([...patchedNodes, newNode])
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
