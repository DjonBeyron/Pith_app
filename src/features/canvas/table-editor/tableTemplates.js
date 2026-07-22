// Шаблоны таблиц — переиспользуемые заготовки сетки, которые админ может
// сохранять/переименовывать/удалять. Хранятся в localStorage: это чисто
// авторский инструмент конструктора, не часть данных урока (в БД не идёт).
const KEY = 'pithy_table_templates'

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? [] } catch { return [] }
}

function writeAll(list) {
  localStorage.setItem(KEY, JSON.stringify(list))
}

export function listTemplates() {
  return readAll()
}

export function saveTemplate(name, table) {
  const entry = { id: crypto.randomUUID(), name, table, savedAt: Date.now() }
  writeAll([...readAll(), entry])
  return entry
}

export function renameTemplate(id, name) {
  writeAll(readAll().map(t => (t.id === id ? { ...t, name } : t)))
}

export function deleteTemplate(id) {
  writeAll(readAll().filter(t => t.id !== id))
}
