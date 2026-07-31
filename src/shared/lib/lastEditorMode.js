// Какой редактор урока открывать по кнопке ⚙ в схеме модуля — граф (canvas)
// или продакшен-список. Раньше было два отдельных входа (⚙ и 📝), теперь
// один ⚙ запоминает последний использованный и открывает сразу его.
// CanvasPage.jsx/ProductionPage.jsx пишут сюда при каждом монтировании —
// это покрывает и прямой вход через ⚙, и переключение через тройку
// «Сохранить → Граф → Продакшен» внутри самих редакторов (там тоже
// происходит полный remount целевой страницы).
const KEY = 'pithy_last_editor_mode'

export function getLastEditorMode() {
  return localStorage.getItem(KEY) === 'production' ? 'production' : 'canvas'
}

export function setLastEditorMode(mode) {
  localStorage.setItem(KEY, mode)
}
