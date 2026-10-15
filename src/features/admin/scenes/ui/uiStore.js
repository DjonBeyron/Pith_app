// Единая обёртка над localStorage для настроек интерфейса сборщика сцен (свёрнутость
// панелей, ширины колонок, вкладка правой панели, тема окна). Отдельно от резервной копии
// черновика (draftBackup.js). Все обращения в try/catch: приватный режим, переполнение,
// битый JSON — настройка молча сбрасывается к значению по умолчанию, битая запись удаляется.
// storage передаётся параметром для тестов; версия в префиксе ключа — смена формата
// не ломает чтение старых записей (они просто игнорируются).

export const UI_PREFIX = 'pithy_scene_builder_ui_v1:'

function store(storage) {
  if (storage) return storage
  try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null }
}

export const uiKey = name => `${UI_PREFIX}${name}`

// Читает значение; validate(value) → true, если значение годное (иначе запись удаляется
// и возвращается fallback)
export function uiRead(name, fallback, { storage, validate } = {}) {
  const s = store(storage)
  if (!s) return fallback
  try {
    const raw = s.getItem(uiKey(name))
    if (raw === null || raw === undefined) return fallback
    const value = JSON.parse(raw)
    if (validate && !validate(value)) { uiRemove(name, { storage: s }); return fallback }
    return value
  } catch {
    uiRemove(name, { storage: s })
    return fallback
  }
}

export function uiWrite(name, value, { storage } = {}) {
  const s = store(storage)
  if (!s) return false
  try {
    if (value === undefined) s.removeItem(uiKey(name))
    else s.setItem(uiKey(name), JSON.stringify(value))
    return true
  } catch { return false }
}

export function uiRemove(name, { storage } = {}) {
  const s = store(storage)
  try { s?.removeItem(uiKey(name)) } catch { /* ничего */ }
}
