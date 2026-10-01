import { normalizeWordCard } from './wordCardModel.js'

// Справка слова в обменном JSON урока (поле верхнего уровня wordCard, см.
// canvas/lesson-io/wordCardDoc.js). Блоки в файле — без id (он служебный):
// при импорте id заводятся заново. Чистые функции без DOM

// Справка из базы/редактора → кусок JSON; null — справки нет, поле не пишем
export function wordCardToJson(wc) {
  const card = normalizeWordCard(wc)
  if (!card) return null
  return { ...(card.tag ? { tag: card.tag } : {}), nodes: card.nodes.map(b => { const copy = { ...b }; delete copy.id; return copy }) }
}

// Кусок JSON → { card, warnings }. Битые блоки выбрасываем с предупреждением, а не
// отказываем всему файлу; блок «Пример диалога» без реплики-отрицания — мягкое
// замечание (по правилу урока в примере должен быть и отрицательный случай)
export function wordCardFromJson(raw) {
  if (raw == null) return { card: null, warnings: [] }
  const warnings = []
  const card = normalizeWordCard(raw)
  const sent = Array.isArray(raw?.nodes) ? raw.nodes.length : 0
  if (!card) {
    warnings.push('справка слова: нет ни одного годного блока — не применяю')
    return { card: null, warnings }
  }
  if (sent > card.nodes.length) {
    warnings.push(`справка слова: ${sent - card.nodes.length} блок(ов) выброшено (неизвестный тип, битый вид или больше 12)`)
  }
  card.nodes.forEach((b, i) => {
    if (b.type === 'dialog' && b.lines.length && !b.lines.some(l => l.neg)) {
      warnings.push(`справка слова: в блоке ${i + 1} «Пример диалога» нет ни одной реплики с neg: true — добавь отрицательный пример`)
    }
  })
  return { card, warnings }
}
