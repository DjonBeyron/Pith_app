// Шаблоны таблиц переехали в Supabase — см. src/shared/api/tableTemplatesApi.js
// (общие для всех уроков и всех машин админа). Здесь остался только мост со
// старым хранилищем: шаблоны, сохранённые в localStorage ДО переезда, при
// первом открытии редактора уезжают на сервер и стираются локально — иначе
// они бы просто пропали из виду.
const KEY = 'pithy_table_templates'

export function readLegacyTemplates() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY))
    return Array.isArray(list) ? list.filter(t => t?.name && t?.table) : []
  } catch { return [] }
}

export function clearLegacyTemplates() {
  try { localStorage.removeItem(KEY) } catch { /* приватный режим — не страшно */ }
}
