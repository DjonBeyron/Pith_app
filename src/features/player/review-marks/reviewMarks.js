import { nodeText } from '../admin/playerEditLabel.js'

// Пометки с телефона («Разбор» как цикл оценки, PROJECT.md 2026-10-22, шаг A): чистые функции. Четыре тега — ровно то, что автор
// отмечает, проходя урок на смартфоне; комментарий необязателен. Запись — reviewMarksApi.js
export const MARK_TAGS = [
  { id: 'robotic', emoji: '🤖', label: 'Роботизированно' },
  { id: 'boring',  emoji: '😴', label: 'Скучно' },
  { id: 'unclear', emoji: '❓', label: 'Непонятно' },
  { id: 'great',   emoji: '👍', label: 'Отлично' },
]
const BY_ID = new Map(MARK_TAGS.map(t => [t.id, t]))
export const tagEmoji = id => BY_ID.get(id)?.emoji ?? '•'
export const tagLabel = id => BY_ID.get(id)?.label ?? id

// Откуда поставлена пометка — коротко, для списка в «Разборе»
export function deviceLabel(ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '')) {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iPhone'
  if (/Android/i.test(ua)) return 'Android'
  return 'ПК'
}

// Запись для reviewMarksApi.addReviewMark: текст ноды — короткий снимок (чтобы в «Разборе» узнать ноду, даже если seq сдвинулся)
export function buildMark({ node, lessonId, tag, comment = '', device = deviceLabel() }) {
  if (!BY_ID.has(tag)) throw new Error(`неизвестный тег пометки: ${tag}`)
  return { lessonId: lessonId ?? null, nodeId: node.id, seq: node.seq ?? null, type: node.type ?? '', text: nodeText(node).slice(0, 300), tag, comment: String(comment ?? '').trim(), device }
}

// «🤖×2 👍» — бейдж на ноде; order — как в MARK_TAGS
export function marksSummary(list) {
  const n = new Map()
  for (const m of list ?? []) n.set(m.tag, (n.get(m.tag) ?? 0) + 1)
  return MARK_TAGS.filter(t => n.has(t.id)).map(t => `${t.emoji}${n.get(t.id) > 1 ? `×${n.get(t.id)}` : ''}`).join(' ')
}
