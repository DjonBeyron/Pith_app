// Горячие клавиши отмены/повтора сборщика — чистые функции (тест: undoKeys.test.js).
// Ctrl/Cmd+Z — отменить; Ctrl/Cmd+Shift+Z и Ctrl+Y — повторить. Раскладка не важна: сравниваем event.code
// (на русской раскладке «Я» всё равно KeyZ), key — запасной вариант.

export function parseUndoKey(e) {
  if (!e || e.altKey || !(e.ctrlKey || e.metaKey)) return null
  const key = String(e.key ?? '').toLowerCase()
  if (e.code === 'KeyZ' || key === 'z') return e.shiftKey ? 'redo' : 'undo'
  if ((e.code === 'KeyY' || key === 'y') && e.ctrlKey && !e.metaKey && !e.shiftKey) return 'redo'
  return null
}

const EDITABLE = /^(INPUT|TEXTAREA)$/

// Поле ввода, у которого своя история (JSON, нейросеть, переименование, «новый вариант» — локальные поля,
// не часть черновика): помечено data-native-undo на себе или предке — там работает обычный Ctrl+Z браузера.
// Остальные поля (реплики, названия, настройки) привязаны к черновику, их родной откат у управляемых
// компонентов ненадёжен — историей управляем мы, ввод там склеен в шаги (draftHistory).
export function isNativeUndoField(el) {
  if (!el || !(EDITABLE.test(el.tagName) || el.isContentEditable)) return false
  return !!el.closest?.('[data-native-undo]')
}

// 'undo' | 'redo' | null — что делать с этим нажатием
export function undoKeyAction(e) {
  if (e.defaultPrevented) return null
  const action = parseUndoKey(e)
  if (!action || isNativeUndoField(e.target)) return null
  return action
}
