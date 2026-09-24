import { useEffect, useState } from 'react'
import { listLessonsWithProgress, isLessonStarted, PROGRESS_EVENT } from '../../shared/lib/lessonProgressApi.js'

// Начатые уроки схемы модуля: lessonId → pct (0..100). Процент — из чекпойнта
// «докуда дошёл» (lessonProgressApi.js); урок, из которого вышли раньше
// чекпойнта, но входили (флаг «начат»), — 1%. Один запрос на весь список при
// открытии схемы; дальше — точечно по событию сохранения/сброса, без новых
// запросов (урок идёт поверх схемы, она остаётся смонтированной).
//
// ready — данные пришли (или вышло время ожидания): схема показывается
// только тогда, чтобы полоска не «дорисовывалась» на глазах. Повторное
// открытие того же модуля — из кэша, сразу готово.
const READY_TIMEOUT_MS = 1500
const cache = new Map() // key (id через |) → Map

function withStarted(ids, map) {
  const out = new Map(map)
  for (const id of ids) if (!out.has(id) && isLessonStarted(id)) out.set(id, 1)
  return out
}

export function useLessonsProgress(lessonIds) {
  const key = lessonIds.join('|')
  const [state, setState] = useState(() => ({ key, map: cache.get(key) ?? new Map(), ready: cache.has(key) }))
  // Другой модуль — сброс до его кэша (в рендере, не эффектом: без кадра со старыми данными)
  if (state.key !== key) setState({ key, map: cache.get(key) ?? new Map(), ready: cache.has(key) })

  useEffect(() => {
    let alive = true
    const ids = key ? key.split('|') : []
    const put = map => { cache.set(key, map); if (alive) setState({ key, map, ready: true }) }
    const timer = setTimeout(() => { if (alive) setState(s => (s.key === key ? { ...s, ready: true } : s)) }, READY_TIMEOUT_MS)
    listLessonsWithProgress(ids).then(m => { clearTimeout(timer); put(withStarted(ids, m)) })
    const onChange = e => {
      const { lessonId, pct, started } = e.detail || {}
      if (!ids.includes(lessonId)) return
      const next = new Map(cache.get(key) ?? [])
      if (pct != null) next.set(lessonId, pct)
      else if (started) { if (!next.has(lessonId)) next.set(lessonId, 1) }
      else next.delete(lessonId)
      put(next)
    }
    window.addEventListener(PROGRESS_EVENT, onChange)
    return () => { alive = false; clearTimeout(timer); window.removeEventListener(PROGRESS_EVENT, onChange) }
  }, [key])

  return state
}
