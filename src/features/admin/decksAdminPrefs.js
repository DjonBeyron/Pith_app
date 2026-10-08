// Память галочки «только без колоды и с малой колодой» во вкладке Админ → «Колоды» (localStorage). Других фильтров/сортировок
// во вкладке нет, поэтому один ключ с одним булевым значением. Чистый модуль без React: любое обращение к хранилищу в try/catch
// (приватный режим, заблокированные данные), нет записи или она битая → значение по умолчанию (галочка включена, как раньше).

export const DECKS_ONLY_PROBLEMS_KEY = 'pithy_admin_decks_only_problems_v1'
export const DEFAULT_ONLY_PROBLEMS = true

// Хранилище по умолчанию: localStorage или null, если до него нельзя дотянуться (сам доступ к свойству тоже может бросить)
function defaultStorage() {
  try { return globalThis.localStorage ?? null } catch { return null }
}

export function readOnlyProblems(storage = defaultStorage()) {
  try {
    const v = JSON.parse(storage?.getItem(DECKS_ONLY_PROBLEMS_KEY) ?? 'null')
    return typeof v === 'boolean' ? v : DEFAULT_ONLY_PROBLEMS
  } catch { return DEFAULT_ONLY_PROBLEMS }
}

// true — записалось, false — хранилище недоступно (выбор тогда живёт только до перезагрузки)
export function writeOnlyProblems(value, storage = defaultStorage()) {
  try {
    if (!storage) return false
    storage.setItem(DECKS_ONLY_PROBLEMS_KEY, JSON.stringify(!!value))
    return true
  } catch { return false }
}
