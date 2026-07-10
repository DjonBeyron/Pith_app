// Локальное хранилище звёзд уроков (localStorage): { lessonId: 1..3 }.
// Двойная роль: у гостя — единственное хранилище, у залогиненного — мгновенное
// отображение на схеме до/без похода на сервер (сервер — источник правды
// между устройствами, при чтении берётся максимум из двух).
const KEY = 'pithy_lesson_stars_v1'

function readMap() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? {} } catch { return {} }
}

// Map<lessonId, stars>
export function getLocalStars() {
  return new Map(Object.entries(readMap()))
}

// Пишет только вверх: пересдача хуже лучший результат не портит.
export function setLocalStars(lessonId, stars) {
  if (!lessonId || !(stars >= 1)) return
  const map = readMap()
  map[lessonId] = Math.min(3, Math.max(stars, map[lessonId] ?? 0))
  localStorage.setItem(KEY, JSON.stringify(map))
}

// Звёзды из числа ошибок: 0 → 3★, 1–2 → 2★, дальше 1★ (урок пройден).
export function starsFromErrors(errors) {
  return errors === 0 ? 3 : errors <= 2 ? 2 : 1
}
