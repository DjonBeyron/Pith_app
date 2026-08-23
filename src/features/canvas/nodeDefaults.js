// Дефолты нод канваса: какой триггер получает нода каждого типа при создании
// или смене типа, и запоминание последнего выбранного типа (новая нода
// создаётся сразу с ним).

const LAST_TYPE_KEY = 'canvas_last_node_type'

export function getLastNodeType() {
  return localStorage.getItem(LAST_TYPE_KEY) ?? 'audio'
}

export function setLastNodeType(type) {
  localStorage.setItem(LAST_TYPE_KEY, type)
}

// Интерактивные типы со своей парой триггеров (порядок = порядок портов).
// Экспортирован: nodeGraphPrimary.js использует тот же порядок, чтобы знать,
// какой из двух триггеров — «основной путь» (correct/submit), а какой — ветка.
export const TYPED_PAIRS = {
  word_choice:     ['word_correct',   'word_wrong'],
  phrase_assembly: ['phrase_correct', 'phrase_wrong'],
  photo_choice:    ['photo_correct',  'photo_wrong'],
  registration:    ['reg_submit',     'reg_cancel'],
  table:           ['table_correct',  'table_wrong'],
}

// Дефолтный триггер обычных типов: медиа со звуком — «воспроизведено до конца»,
// статичное (текст/фото/стикер/системное/закреп) — таймер 2 секунды.
const DEFAULT_TRIGGER = {
  audio:       { if: 'played' },
  video:       { if: 'played' },
  circle:      { if: 'played' },
  text:        { if: 'timer', ms: 2000 },
  photo:       { if: 'timer', ms: 2000 },
  sticker:     { if: 'timer', ms: 2000 },
  system:      { if: 'timer', ms: 2000 },
  pin_message: { if: 'timer', ms: 2000 },
}

// Триггеры для ноды типа type; keepThen — существующая связь, которую надо
// сохранить (уходит в первый триггер).
export function makeDefaultTriggers(type, keepThen = null) {
  const pair = TYPED_PAIRS[type]
  if (pair) {
    return pair.map((ifVal, i) => ({
      id: crypto.randomUUID(), if: ifVal, then: i === 0 ? keepThen : null,
    }))
  }
  const d = DEFAULT_TRIGGER[type] ?? { if: 'played' }
  return [{
    id: crypto.randomUUID(), if: d.if,
    ...(d.ms != null ? { ms: d.ms } : {}),
    then: keepThen,
  }]
}

// Уже есть родная пара триггеров этого типа? (тогда при смене типа не трогаем)
export function hasOwnTriggers(type, triggers = []) {
  const pair = TYPED_PAIRS[type]
  if (!pair) return false
  return triggers.some(t => pair.includes(t.if))
}

// В каком поле у типа лежит текст сообщения. Названия исторически разные:
// у голосового это подпись к аудио, у стикера — подпись под картинкой.
const TEXT_FIELD = {
  text: 'content',
  pin_message: 'content',
  system: 'content',
  audio: 'text',
  sticker: 'caption',
  photo: 'caption',
}

// Переносит написанный текст (и его раскраску) в поле нового типа: автор
// набрал реплику в голосовом, передумал и сделал её текстовой — перепечатывать
// заново незачем. Позиции выделений считаются по той же строке, поэтому
// переезжают вместе с ней.
function carryText(node, newType) {
  const from = TEXT_FIELD[node.type]
  const to = TEXT_FIELD[newType]
  if (!from || !to) return null

  const oldData = node.typeData?.[node.type] ?? {}
  const text = oldData[from]
  if (typeof text !== 'string' || !text.trim()) return null

  const newData = node.typeData?.[newType] ?? {}
  // Уже написанный текст нового типа не затираем
  if (typeof newData[to] === 'string' && newData[to].trim()) return null

  const patch = { ...newData, [to]: text }
  if (oldData.highlights?.length) patch.highlights = oldData.highlights
  if (typeof oldData.hardWrap === 'boolean') patch.hardWrap = oldData.hardWrap
  return { ...node.typeData, [newType]: patch }
}

// Патч { type, triggers?, typeData? } для смены типа ноды: пересобирает
// триггеры под дефолт нового типа, сохраняя единственную существующую связь
// (then) в первом триггере — если у нового типа нет родной пары, — и
// перетаскивает текст сообщения между текстовыми типами. Общая логика для
// CanvasNode (mini/max) и ProductionList (строка списка).
export function applyTypeChange(node, newType) {
  setLastNodeType(newType)
  const typeData = carryText(node, newType)
  const patch = { type: newType, ...(typeData ? { typeData } : {}) }
  if (hasOwnTriggers(newType, node.triggers)) return patch
  const keepThen = node.triggers?.find(t => t.then)?.then ?? null
  return { ...patch, triggers: makeDefaultTriggers(newType, keepThen) }
}
