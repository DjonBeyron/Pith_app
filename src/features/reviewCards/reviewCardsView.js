import { TYPE_COLOR, TYPE_SHORT } from '../canvas/nodeTypes.js'
import { getVariantList } from '../canvas/nodeVariants.js'
import { nodeText } from '../player/admin/playerEditLabel.js'
import { getPrimaryTriggerIndex, getBranchTriggerIndex } from '../production/nodeGraphPrimary.js'
import { isTaskNode } from './reviewCardCopy.js'

// Чистые функции отображения редактора карточек (ReviewCardsPage): урок-
// источник слева — строки, фильтры по типам, метки веток — и мини-превью
// карточек сверху. Цвета — те же, что у нод на канвасе (TYPE_COLOR)

const TEXT_TYPES = new Set(['text', 'pin_message', 'system', 'rotate_phone', 'lesson_ref'])
const MEDIA_TYPES = new Set(['photo', 'video', 'circle', 'sticker'])
const ICON = { audio: '🔊', photo: '🖼', video: '🎬', circle: '⭕', sticker: '🙂', reaction: '❤' }

export const SOURCE_FILTERS = [
  { id: 'all', label: 'Все', test: () => true },
  { id: 'task', label: 'Задания', test: isTaskNode },
  { id: 'text', label: 'Текст', test: n => TEXT_TYPES.has(n.type) },
  { id: 'audio', label: 'Аудио', test: n => n.type === 'audio' },
  { id: 'media', label: 'Медиа', test: n => MEDIA_TYPES.has(n.type) },
]

export const MARK_LABEL = { ok: '✓ после верного', bad: '✗ после ошибки', hint: '💡 подсказка на ошибку' }

const bySeq = (a, b) => (a.seq ?? 0) - (b.seq ?? 0)
const dataOf = n => n.typeData?.[n.type] ?? {}
export const colorOf = n => TYPE_COLOR[n?.type] ?? TYPE_COLOR.text

// Метки веток: куда ведут «верно»/«неверно» заданий (только вперёд по уроку —
// возврат к вопросу на ошибку веткой не считаем) и чьи ноды — подсказки-сигналы
function branchMarks(nodes) {
  const seqOf = new Map(nodes.map(n => [n.id, n.seq ?? 0]))
  const marks = new Map()
  for (const n of nodes) {
    if (isTaskNode(n)) {
      const ok = n.triggers?.[getPrimaryTriggerIndex(n)]?.then
      const bad = n.triggers?.[getBranchTriggerIndex(n)]?.then
      if (ok && seqOf.get(ok) > (n.seq ?? 0)) marks.set(ok, 'ok')
      if (bad && seqOf.get(bad) > (n.seq ?? 0)) marks.set(bad, 'bad')
    }
    for (const s of dataOf(n).signals ?? []) if (s?.ref) marks.set(s.ref, 'hint')
  }
  return marks
}

// Варианты ответа задания: у «выбери слово» верный помечен
function answersOf(n) {
  if (n.type === 'word_choice') {
    return (dataOf(n).options ?? []).map(o => ({ text: o.text ?? '', ok: !!o.isCorrect })).filter(a => a.text)
  }
  return getVariantList(n.type, dataOf(n)).map(v => ({ text: v.label ?? '', ok: false })).filter(a => a.text)
}

// Строки урока-источника по порядку урока
export function sourceRows(lessonNodes) {
  const nodes = [...(lessonNodes ?? [])].sort(bySeq)
  const marks = branchMarks(nodes)
  return nodes.map(n => ({
    id: n.id,
    seq: n.seq,
    node: n,
    type: TYPE_SHORT[n.type] ?? n.type,
    color: colorOf(n),
    icon: ICON[n.type] ?? '',
    text: nodeText(n),
    answers: isTaskNode(n) ? answersOf(n) : [],
    isTask: isTaskNode(n),
    mark: marks.get(n.id) ?? null,
  }))
}

const filterOf = id => SOURCE_FILTERS.find(f => f.id === id) ?? SOURCE_FILTERS[0]
export const rowsFor = (rows, filterId) => rows.filter(r => filterOf(filterId).test(r.node))
export const filterCounts = rows =>
  Object.fromEntries(SOURCE_FILTERS.map(f => [f.id, rows.filter(r => f.test(r.node)).length]))

// Мини-превью карточки: цвета нод по порядку, первый текст, число нод.
// Пустая (без нод) при сохранении выбрасывается — превью пишет об этом
export function cardSummary(card) {
  const nodes = [...(card?.nodes ?? [])].sort(bySeq)
  return {
    colors: nodes.map(colorOf),
    text: nodes.map(nodeText).find(Boolean) ?? '',
    count: nodes.length,
    hasTask: nodes.some(isTaskNode),
  }
}
