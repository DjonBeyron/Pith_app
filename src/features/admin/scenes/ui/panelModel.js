// Чистая модель свёрнутости панелей сборщика: набор ключей свёрнутых панелей (массив
// строк — так он хранится в localStorage через uiStore). Ключ панели стабилен («timeline»,
// «characters.a», «timeline.3»), вложенность — через точку. Все функции возвращают новый
// массив, исходный не трогают. UI — usePanelState.js / Panel.jsx.

export const COLLAPSED_KEY = 'collapsed'

export const isCollapsed = (collapsed, key) => collapsed.includes(key)

export function setCollapsed(collapsed, key, value) {
  const has = collapsed.includes(key)
  if (value && !has) return [...collapsed, key]
  if (!value && has) return collapsed.filter(k => k !== key)
  return collapsed
}

export const toggleCollapsed = (collapsed, key) => setCollapsed(collapsed, key, !collapsed.includes(key))

// Развернуть всю цепочку (путь к ошибке линтера): ['timeline', 'timeline.3'] → ни одна не свёрнута
export function expandPath(collapsed, keys) {
  const set = new Set(keys)
  const next = collapsed.filter(k => !set.has(k))
  return next.length === collapsed.length ? collapsed : next
}

// «Свернуть все / Развернуть все»: keys — зарегистрированные панели (все или одной колонки).
// Сворачиваем только верхний уровень (без точки в ключе): вложенные остаются как были,
// иначе после «Развернуть все» админ увидел бы распахнутые до дна формы персонажей
export function setAllCollapsed(collapsed, keys, value, { topOnly = true } = {}) {
  let next = collapsed
  for (const k of keys) {
    if (topOnly && k.includes('.')) continue
    next = setCollapsed(next, k, value)
  }
  return next
}

// Что показать на кнопке «все»: если среди верхних панелей колонки есть развёрнутая — «Свернуть все»
export function allCollapsed(collapsed, keys) {
  const top = keys.filter(k => !k.includes('.'))
  return top.length > 0 && top.every(k => collapsed.includes(k))
}

// Валидатор записи из localStorage: массив коротких строк, без мусора
export function validCollapsed(v) {
  return Array.isArray(v) && v.length <= 400 && v.every(k => typeof k === 'string' && k.length > 0 && k.length <= 64)
}
