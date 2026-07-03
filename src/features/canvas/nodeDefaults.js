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

// Интерактивные типы со своей парой триггеров (порядок = порядок портов)
const TYPED_PAIRS = {
  word_choice:     ['word_correct',   'word_wrong'],
  phrase_assembly: ['phrase_correct', 'phrase_wrong'],
  photo_choice:    ['photo_correct',  'photo_wrong'],
  registration:    ['reg_submit',     'reg_cancel'],
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
