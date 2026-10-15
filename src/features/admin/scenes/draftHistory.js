// История правок черновика сборщика (undo/redo) — чистая модель без React.
// Шаг: { before: { scene, saved? }, label, key, at } — «что было ДО шага» и подпись для подсказки
// («удаление реплики 3»). saved записывается только у шагов, меняющих привязку к библиотеке
// (загрузка/открытие сцены, «Новая»): отмена возвращает и сцену, и строку, к которой она была привязана,
// иначе «Сохранить» после отмены перезаписало бы чужую сцену.
// Склейка (coalesce): шаги с одинаковым key (ввод текста в одно поле, ползунок, выбор цвета),
// идущие с паузами не больше COALESCE_MS, сливаются в один — Ctrl+Z откатывает весь ввод, а не букву.
// Новая правка после отмены очищает «повтор» (future). Глубина — HISTORY_LIMIT шагов.

export const HISTORY_LIMIT = 50
export const COALESCE_MS = 600

export const emptyHistory = () => ({ past: [], future: [] })

// Закрыть последний шаг для склейки: после отмены/повтора новая правка всегда отдельный шаг
const closeLast = past => (past.length ? [...past.slice(0, -1), { ...past[past.length - 1], at: -Infinity }] : past)

export function pushStep(h, step, { limit = HISTORY_LIMIT, gap = COALESCE_MS } = {}) {
  const last = h.past[h.past.length - 1]
  if (step.key && last && last.key === step.key && step.at - last.at <= gap) {
    return { past: [...h.past.slice(0, -1), { ...last, at: step.at }], future: [] }
  }
  const past = [...h.past, step]
  return { past: past.length > limit ? past.slice(past.length - limit) : past, future: [] }
}

// Текущее состояние cur = { scene, saved } → обратный шаг (чтобы можно было повторить/снова отменить)
const mirror = (top, cur) => ({
  before: top.before.saved !== undefined ? { scene: cur.scene, saved: cur.saved } : { scene: cur.scene },
  label: top.label, key: null, at: -Infinity,
})

// → null (нечего отменять) или { history, state: { scene, saved? }, label }
export function undo(h, cur) {
  const top = h.past[h.past.length - 1]
  if (!top) return null
  return { history: { past: closeLast(h.past.slice(0, -1)), future: [...h.future, mirror(top, cur)] }, state: top.before, label: top.label }
}

export function redo(h, cur) {
  const top = h.future[h.future.length - 1]
  if (!top) return null
  return { history: { past: [...h.past, mirror(top, cur)], future: h.future.slice(0, -1) }, state: top.before, label: top.label }
}

export const canUndo = h => h.past.length > 0
export const canRedo = h => h.future.length > 0
export const undoLabel = h => h.past[h.past.length - 1]?.label ?? null
export const redoLabel = h => h.future[h.future.length - 1]?.label ?? null
