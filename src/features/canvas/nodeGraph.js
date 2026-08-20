import { makeDefaultTriggers, getLastNodeType } from './nodeDefaults.js'

// Шаг сетки — ровно ширина max-ноды, без зазора: новая нода встаёт вплотную
// к предыдущей. Общий для CanvasBoard (drag/insert) и ProductionList.
export const NODE_SLOT = 308
// Вертикальный шаг между ветками одной ноды: вторая и следующая связи
// уходят вниз, а не расталкивают граф вправо
export const NODE_ROW = 420

// Порядковые номера следуют порядку графа: вход (нода без входящих связей) = #1,
// дальше — обход по триггерам. Несвязанные ноды идут после, в старом порядке.
// Общая для canvas и production-списка: оба вида одного и того же урока должны
// нумеровать ноды одинаково.
export function computeSeqMap(nodes) {
  const incoming = new Set()
  nodes.forEach(n => (n.triggers ?? []).forEach(t => { if (t.then) incoming.add(t.then) }))
  const byId  = Object.fromEntries(nodes.map(n => [n.id, n]))
  const bySeq = nodes.slice().sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
  const order = []
  const seen  = new Set()
  function visit(n) {
    if (!n || seen.has(n.id)) return
    seen.add(n.id)
    order.push(n.id)
    ;(n.triggers ?? []).forEach(t => visit(byId[t.then]))
  }
  bySeq.filter(n => !incoming.has(n.id)).forEach(visit) // корни графа
  bySeq.forEach(visit)                                  // циклы и осколки
  return new Map(order.map((id, i) => [id, i + 1]))
}

// Применяет перенумерацию к списку нод (без изменений — возвращает тот же массив)
export function renumber(list) {
  const seqMap = computeSeqMap(list)
  if (list.every(n => seqMap.get(n.id) === n.seq)) return list
  return list.map(n => ({ ...n, seq: seqMap.get(n.id) }))
}

// wantType — тип выбран в меню создания; без него берётся последний
// использованный
export function makeNode(seq, x, y, wantType) {
  const type = wantType ?? getLastNodeType()
  return {
    id: crypto.randomUUID(),
    seq,
    x,
    y,
    size: 'max',
    type,
    triggers: makeDefaultTriggers(type),
    typeData: {
      audio:       { file_id: null },
      photo:       { file_id: null, crop: { x: 0, y: 0, scale: 1 } },
      video:       { file_id: null, crop: { x: 0, y: 0, scale: 1 } },
      circle:      { file_id: null, crop: { x: 0, y: 0, scale: 1 } },
      text:        { content: '', replyToSeq: null, hardWrap: false },
      word_choice:     { options: [], responseCorrect: '', responseWrong: '', sendPickToChat: false },
      phrase_assembly: { words: [], distractors: [], responseCorrect: '', responseWrong: '', replyToSeq: null },
      pin_message:     { content: '' },
      system:          { content: '' },
      sticker:         { file_id: null, crop: { x: 0, y: 0, scale: 1 }, muted: true, isVideo: false, replyToSeq: null, caption: '', autoSound: false },
      photo_choice:    { photos: [], correctIndexes: [], responseCorrect: '', responseWrong: '' },
    },
  }
}
