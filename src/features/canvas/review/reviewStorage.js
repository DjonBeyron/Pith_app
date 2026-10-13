// Замечания разбора живут в localStorage браузера: после перезагрузки страницы они на месте. Ключ — по нодам урока (id первой ноды + число нод).
export const reviewKey = nodes => `pithy-review:${nodes?.[0]?.id ?? 'empty'}:${nodes?.length ?? 0}`

export function loadReview(key) {
  try {
    const d = JSON.parse(localStorage.getItem(key) ?? 'null')
    return d && typeof d === 'object' ? d : null
  } catch { return null }
}

/** Пустое состояние стирает запись, чтобы не копить мусор */
export function saveReview(key, data) {
  try {
    const empty = !data.notes?.length && !data.general?.length && !data.originals?.length
    if (empty) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(data))
  } catch { /* хранилище недоступно или переполнено — замечания живут до закрытия окна */ }
}
