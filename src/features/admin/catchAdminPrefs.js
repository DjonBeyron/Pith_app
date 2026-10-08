// Память выбора во вкладке Админ → «Ловля» (localStorage, ключ pithy_admin_catch_v1): какая фраза выбрана, уровни слов
// ПО КАЖДОЙ фразе отдельно, переключатель «Писать сигналы в память» и раскрыта ли справка «?». Чистый модуль без React:
// любое обращение к хранилищу в try/catch (приватный режим, заблокированные данные), битый JSON → значения по умолчанию.
// prefs = { moduleId: string, levelsByModule: { [moduleId]: { [индекс слова]: 0..4 } }, write: boolean, help: boolean }

export const CATCH_PREFS_KEY = 'pithy_admin_catch_v1'
const MAX_LEVEL = 4

export const defaultCatchPrefs = () => ({ moduleId: '', levelsByModule: {}, write: false, help: false })

const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v)

// Хранилище по умолчанию: localStorage или null, если до него нельзя дотянуться (сам доступ к свойству тоже может бросить)
function defaultStorage() {
  try { return globalThis.localStorage ?? null } catch { return null }
}

// Уровни одной фразы: оставляем только целые 0..4 по целочисленным индексам слов
function cleanLevels(raw) {
  const out = {}
  if (!isObj(raw)) return out
  for (const [k, v] of Object.entries(raw)) {
    if (/^\d+$/.test(k) && Number.isInteger(v) && v >= 0 && v <= MAX_LEVEL) out[k] = v
  }
  return out
}

// Прочитать сохранённое; что угодно сломанное — по умолчанию (поле за полем: одно битое не губит остальные)
export function readCatchPrefs(storage = defaultStorage()) {
  const prefs = defaultCatchPrefs()
  let data = null
  try {
    const raw = storage?.getItem(CATCH_PREFS_KEY)
    data = raw ? JSON.parse(raw) : null
  } catch { return prefs }
  if (!isObj(data)) return prefs
  if (typeof data.moduleId === 'string') prefs.moduleId = data.moduleId
  if (typeof data.write === 'boolean') prefs.write = data.write
  if (typeof data.help === 'boolean') prefs.help = data.help
  if (isObj(data.levelsByModule)) {
    for (const [id, lv] of Object.entries(data.levelsByModule)) prefs.levelsByModule[id] = cleanLevels(lv)
  }
  return prefs
}

// Записать; true — получилось, false — хранилище недоступно (выбор тогда живёт только до закрытия вкладки)
export function writeCatchPrefs(prefs, storage = defaultStorage()) {
  try {
    if (!storage) return false
    storage.setItem(CATCH_PREFS_KEY, JSON.stringify(prefs))
    return true
  } catch { return false }
}

// Какая фраза выбрана после загрузки списка: сохранённая, если она ещё есть, иначе первая ('' — список пуст)
export function resolveModuleId(savedId, list) {
  if (!list?.length) return ''
  return list.some(m => m.id === savedId) ? savedId : list[0].id
}

// Копия prefs с новыми уровнями слов одной фразы (остальные фразы не трогаем)
export const withLevels = (prefs, moduleId, levels) => ({
  ...prefs, levelsByModule: { ...prefs.levelsByModule, [moduleId]: levels },
})
