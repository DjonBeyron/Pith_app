// Какая подсказка «?» открыта сейчас (одна на всё окно). HelpTip регистрирует здесь
// свою функцию закрытия; Esc окна вызывает closeOpenHelp — сначала закрывается подсказка,
// и только потом окно.
let current = null

export const registerOpenHelp = close => { current = close }
export const unregisterOpenHelp = close => { if (current === close) current = null }

// Закрыть открытую подсказку. refocus — вернуть фокус на её кнопку. true — подсказка была открыта
export function closeOpenHelp(refocus = false) {
  if (!current) return false
  current(refocus)
  return true
}
