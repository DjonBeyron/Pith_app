// Справочники и вспомогательные функции окна правил (LessonRulesPanel). Чистые функции, без React.
export const CHECKERS = [
  { id: 'auto', icon: '🤖', label: 'Линтер (код)', hint: 'Проверяется кодом — нарушить нельзя' },
  { id: 'judge', icon: '⚖️', label: 'ИИ-судья', hint: 'Проверяет отдельный вызов ИИ' },
  { id: 'manual', icon: '✍️', label: 'Вручную', hint: 'Только промпт и глаза автора' },
]
export const SEVERITIES = [
  { id: 'error', label: 'Ошибка' },
  { id: 'warn', label: 'Совет' },
]
export const checkerOf = id => CHECKERS.find(c => c.id === id) ?? CHECKERS[2]

/** Группы по умолчанию — подсказка по ключевым словам, пока автор не задал группу сам */
const GROUP_GUESS = [
  ['Сигналы', /сигнал|signals|companion/i],
  ['Голос и сказать', /say_phrase|голос|audio|озвуч|vosk/i],
  ['Выделения и стиль', /highlight|раскраск|bold|цвет|hardWrap|подчёрк|выдел/i],
  ['Холст и раскладка', /холст|pos\b|зон[аы]|раскладк/i],
  ['Задания', /type_word|phrase_assembly|fill_blanks|word_choice|table|photo_choice|упражнен|задани/i],
  ['Тон и общение', /Пит|друг|реакци|вайб|пол ученика|безлич/i],
]
export const guessGroup = text => GROUP_GUESS.find(([, re]) => re.test(text ?? ''))?.[0] ?? 'Общее'
export const groupOf = r => r.group || guessGroup(r.text)

/** Короткое название для списка: заданное автором или первая фраза текста правила (до 70 знаков) */
export function ruleTitle(r) {
  if (r.title?.trim()) return r.title.trim()
  const first = String(r.text ?? '').split(/(?<=[.:;!?—])\s/)[0].replace(/\s+/g, ' ').trim()
  return first.length > 70 ? first.slice(0, 67) + '…' : first
}

/** Подходит ли правило под поиск и фильтры окна */
export function ruleMatches(r, { q = '', group = '', checker = '', onlyActive = false }) {
  if (onlyActive && !r.active) return false
  if (group && groupOf(r) !== group) return false
  if (checker && r.checker !== checker) return false
  const needle = q.trim().toLowerCase()
  return !needle || `${ruleTitle(r)} ${r.text} ${r.bad} ${r.good}`.toLowerCase().includes(needle)
}
