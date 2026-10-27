// Расписание строк рассказа Пита (MemoryStory.jsx): когда какая фраза выходит на экран.
// Чистые функции — без таймеров и звука, проверяются в консоли.

const MS_PER_CHAR = 70     // темп чтения про себя без озвучки
const MS_PER_LINE = 600    // пауза на каждую фразу
const MIN_TOTAL_MS = 12000 // рассказ не короче 12 с и не длиннее 22 с — как договорено в плане
const MAX_TOTAL_MS = 22000

// Общая длительность без озвучки: ~70 мс на символ + 600 мс на строку, зажатая в 12–22 с
export function defaultTotalMs(lines) {
  const chars = lines.reduce((s, l) => s + l.length, 0)
  const raw = chars * MS_PER_CHAR + lines.length * MS_PER_LINE
  return Math.min(MAX_TOTAL_MS, Math.max(MIN_TOTAL_MS, raw))
}

// Строки делят totalMs пропорционально числу символов: [{ at, dur }] в мс от начала.
// Пустой список — пустой массив (не делим на ноль)
export function lineSchedule(lines, totalMs) {
  const chars = lines.map(l => Math.max(1, l.length))
  const sum = chars.reduce((s, n) => s + n, 0)
  let at = 0
  return chars.map(n => {
    const dur = Math.round((totalMs * n) / sum)
    const item = { at, dur }
    at += dur
    return item
  })
}
