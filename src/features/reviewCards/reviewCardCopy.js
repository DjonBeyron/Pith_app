import { TYPED_PAIRS } from '../canvas/nodeDefaults.js'
import { getPrimaryTriggerIndex } from '../production/nodeGraphPrimary.js'
import { NODE_SLOT } from '../canvas/nodeGraph.js'

// Колода карточек повтора (этап 3 системы повторения, PROJECT.md → «Колоды»).
// Карточка = короткая цепочка нод той же схемы, что урок: { id, nodes: [] }.
// Хранится в lessons.script.reviewCards. «Подтянуть из урока» — это КОПИЯ:
// у копий свои id, и дальше они правятся независимо от урока.

// Меньше стольких карточек — автор видит предупреждение (PROJECT.md)
export const MIN_CARDS = 3

// Задание в карточке — нода со своей парой «верно/неверно». Регистрация —
// не задание, в колоду не берём
const TASK_TYPES = new Set(Object.keys(TYPED_PAIRS).filter(t => t !== 'registration'))

// Что годится «контекстом» перед заданием в черновике: сообщение, которое
// ученик видит/слышит прямо перед вопросом
const CONTEXT_TYPES = new Set(['text', 'audio', 'video', 'circle', 'photo', 'sticker', 'pin_message'])

const uid = () => crypto.randomUUID()
const bySeq = (a, b) => (a.seq ?? 0) - (b.seq ?? 0)
const dataOf = n => n.typeData?.[n.type] ?? {}

export const isTaskNode = n => TASK_TYPES.has(n?.type)
export const cardHasTask = card => (card?.nodes ?? []).some(isTaskNode)
export const makeEmptyCard = () => ({ id: uid(), nodes: [] })

// 'none' — колоды нет, 'few' — меньше MIN_CARDS, 'ok' — достаточно.
// Пустые карточки (без нод) не считаются
export function deckStatus(cards) {
  const n = (cards ?? []).filter(c => c?.nodes?.length).length
  if (n === 0) return 'none'
  return n < MIN_CARDS ? 'few' : 'ok'
}

// Ноды-сигналы (signals[].ref — спутник, играет оверлеем при ошибке) едут в
// карточку вместе с нодой, даже если их не выбирали: без них подсказка на
// ошибку пропала бы. Собираем замыкание — у спутника могут быть свои сигналы
function withSignalCompanions(lessonNodes, ids) {
  const byId = new Map(lessonNodes.map(n => [n.id, n]))
  const out = new Set(ids)
  const queue = [...ids]
  while (queue.length) {
    const node = byId.get(queue.shift())
    for (const s of dataOf(node ?? {}).signals ?? []) {
      if (s?.ref && byId.has(s.ref) && !out.has(s.ref)) { out.add(s.ref); queue.push(s.ref) }
    }
  }
  return out
}

// Копия выбранных нод урока для карточки. Порядок — как в уроке (по seq),
// спутники-сигналы — в конце. Все ссылки внутри копии переписаны на новые id
// (приём idByRef из importLesson.js); ссылка наружу карточки обнуляется, а
// основной переход выбранной ноды ведёт на следующую выбранную — чтобы
// карточка проигрывалась цепочкой, даже если в уроке между ними были ноды
export function copyNodesForCard(lessonNodes, selectedIds) {
  const picked = new Set(selectedIds)
  const all = withSignalCompanions(lessonNodes, [...picked])
  const main = lessonNodes.filter(n => picked.has(n.id)).sort(bySeq)
  const companions = lessonNodes.filter(n => all.has(n.id) && !picked.has(n.id)).sort(bySeq)
  const ordered = [...main, ...companions]

  const newId = new Map(ordered.map(n => [n.id, uid()]))
  const newSeq = new Map(ordered.map((n, i) => [n.seq, i + 1]))
  const mainNext = new Map(main.map((n, i) => [n.id, main[i + 1]?.id ?? null]))

  return ordered.map((n, i) => {
    const copy = structuredClone(n)
    const data = dataOf(copy)
    if (Array.isArray(data.signals)) {
      data.signals = data.signals.map(s => ({ ...s, ref: newId.get(s.ref) ?? null })).filter(s => s.ref)
    }
    if (data.replyToSeq > 0) data.replyToSeq = newSeq.get(data.replyToSeq) ?? null
    const primary = getPrimaryTriggerIndex(n)
    const triggers = (copy.triggers ?? []).map((t, ti) => {
      let then = t.then && newId.has(t.then) ? newId.get(t.then) : null
      // Основной путь выбранной ноды, ушедший за пределы карточки, — на следующую выбранную
      if (ti === primary && mainNext.has(n.id) && !(t.then && picked.has(t.then))) {
        then = mainNext.get(n.id) ? newId.get(mainNext.get(n.id)) : null
      }
      return { ...t, id: uid(), then }
    })
    return { ...copy, id: newId.get(n.id), seq: i + 1, x: i * NODE_SLOT, y: 0, triggers }
  })
}

// Нода, чей основной переход ведёт прямо в задание, — контекст к нему
function contextBefore(lessonNodes, task) {
  return lessonNodes.find(n =>
    CONTEXT_TYPES.has(n.type) && n.triggers?.[getPrimaryTriggerIndex(n)]?.then === task.id) ?? null
}

// «Черновик колоды из урока»: по карточке на каждое задание урока, с
// сообщением-контекстом перед ним, если оно есть. Автор потом правит сам
export function draftDeckFromLesson(lessonNodes) {
  const nodes = lessonNodes ?? []
  return nodes.filter(isTaskNode).sort(bySeq).map(task => {
    const ctx = contextBefore(nodes, task)
    return { id: uid(), nodes: copyNodesForCard(nodes, ctx ? [ctx.id, task.id] : [task.id]) }
  })
}

// Дописать скопированные ноды в конец карточки: номера и позиции — после
// существующих, а основной переход последней ноды карточки (если вёл в
// никуда) — на первую новую, чтобы карточка осталась одной цепочкой
export function appendToCard(cardNodes, copies) {
  const existing = [...(cardNodes ?? [])].sort(bySeq)
  if (!copies.length) return existing
  const shifted = copies.map((n, i) => ({
    ...n, seq: existing.length + i + 1, x: (existing.length + i) * NODE_SLOT,
  }))
  const last = existing[existing.length - 1]
  if (!last) return shifted
  const idx = getPrimaryTriggerIndex(last)
  const linked = last.triggers?.[idx] && !last.triggers[idx].then
    ? { ...last, triggers: last.triggers.map((t, ti) => (ti === idx ? { ...t, then: shifted[0].id } : t)) }
    : last
  return [...existing.slice(0, -1), linked, ...shifted]
}
