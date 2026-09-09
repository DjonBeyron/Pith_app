// Мост к уже готовому пошаговому прогону урока (usePlayerStepControl.js):
// LessonPlayer.jsx строит его ВСЕГДА (не только в режиме правки из канваса),
// просто раньше это было видно только на десктопе через PlayerAdminPanel
// (playerEditPanel скрыта под 900px). Здесь — не новая логика шага, а просто
// способ дотянуться до той же самой, уже существующей, чтобы показать её
// кнопки в мобильном дебаг-тулбаре. LessonPlayer регистрирует текущий `step`
// сюда (dev-only), тулбар — читает.
let current = null
const listeners = new Set()

export function registerPlayerStep(step) {
  current = step
  listeners.forEach(fn => fn(current))
}

export function onPlayerStepChange(fn) {
  listeners.add(fn)
  // Регистрация в LessonPlayer могла случиться раньше, чем тулбар успел
  // подписаться (обычный порядок монтирования) — без этого поздний подписчик
  // навсегда пропускал бы уже готовое значение и ждал следующего рендера плеера
  fn(current)
  return () => listeners.delete(fn)
}
