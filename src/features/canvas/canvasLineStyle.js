// Цвет связи по смыслу перехода. В больших графах одинаковые линии сливаются
// в кашу, и «куда ведёт этот провод» приходится выяснять по одной штуке.
// Приём взят из редакторов нод (Unreal красит провода по типу данных,
// Houdini — вектор фиолетовым, число белым): цвет должен что-то значить.
//
// У нас значение — исход ответа: верно / неверно / особый переход варианта /
// обычное продолжение (доиграло, таймер, фото показано).

const CORRECT = new Set(['word_correct', 'phrase_correct', 'photo_correct', 'table_correct'])
const WRONG   = new Set(['word_wrong', 'phrase_wrong', 'photo_wrong', 'table_wrong'])
// Обычные переходы — не про ответ, а про течение урока
const PLAIN   = new Set(['played', 'timer', 'timer_after_play', 'photo_shown', 'reg_submit', 'reg_cancel'])

export const LINK_COLORS = {
  correct: '#4ade80',   // верный ответ — тот же зелёный, что в плеере
  wrong:   '#f87171',   // неверный — тот же красный
  variant: '#a78bfa',   // особый переход конкретного варианта
  plain:   '#b6fe3b',   // обычное продолжение — фирменный лайм, как было
}

// Вид связи по полю if её триггера
export function linkKind(ifValue) {
  if (CORRECT.has(ifValue)) return 'correct'
  if (WRONG.has(ifValue)) return 'wrong'
  if (PLAIN.has(ifValue)) return 'plain'
  // Всё остальное — id варианта ответа: у него свой, «в обход» переход
  return ifValue ? 'variant' : 'plain'
}

export function linkColor(ifValue) {
  return LINK_COLORS[linkKind(ifValue)]
}
