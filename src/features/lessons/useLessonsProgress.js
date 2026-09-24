import { useEffect, useState } from 'react'
import { listLessonsWithProgress, isLessonStarted, PROGRESS_EVENT } from '../../shared/lib/lessonProgressApi.js'

// Начатые уроки схемы модуля: lessonId → pct (0..100). Процент — из чекпойнта
// «докуда дошёл» (lessonProgressApi.js); урок, из которого вышли раньше
// чекпойнта, но входили (флаг «начат»), — 1%.
//
// ready — данные есть (или вышло время ожидания): схема показывается только
// тогда, чтобы полоска не «дорисовывалась» на глазах.
//
// Кэш по модулю живёт вне компонента и обновляется событиями сохранения/
// сброса ВСЕГДА — даже когда схемы нет на экране: пока идёт урок, схема
// размонтирована (CurriculumView рисует вместо неё плеер). Без этого после
// выхода из урока схема вставала со старым кэшем, а полоска появлялась
// позже, когда доезжал запрос. Запрос при открытии остаётся — фоном, для
// сверки с сервером (другое устройство и т.п.).
const READY_TIMEOUT_MS = 1500
const cache = new Map() // key (id через |) → Map<lessonId, pct>

function withStarted(ids, map) {
  const out = new Map(map)
  for (const id of ids) if (!out.has(id) && isLessonStarted(id)) out.set(id, 1)
  return out
}

function applyChange(map, { lessonId, pct, started }) {
  const next = new Map(map)
  if (pct != null) next.set(lessonId, pct)
  else if (started) { if (!next.has(lessonId)) next.set(lessonId, 1) }
  else next.delete(lessonId)
  return next
}

// Один слушатель на всё приложение: правит все кэши, где есть этот урок
if (typeof window !== 'undefined') {
  window.addEventListener(PROGRESS_EVENT, e => {
    const d = e.detail || {}
    for (const [key, map] of cache) {
      if (key.split('|').includes(d.lessonId)) cache.set(key, applyChange(map, d))
    }
  })
}

function initial(key) {
  const ids = key ? key.split('|') : []
  return cache.has(key)
    ? { key, map: withStarted(ids, cache.get(key)), ready: true }
    : { key, map: new Map(), ready: false }
}

export function useLessonsProgress(lessonIds) {
  const key = lessonIds.join('|')
  const [state, setState] = useState(() => initial(key))
  // Другой модуль — сброс до его кэша (в рендере, не эффектом: без кадра со старыми данными)
  if (state.key !== key) setState(initial(key))

  useEffect(() => {
    let alive = true
    const ids = key ? key.split('|') : []
    const timer = setTimeout(() => { if (alive) setState(s => (s.key === key ? { ...s, ready: true } : s)) }, READY_TIMEOUT_MS)
    listLessonsWithProgress(ids).then(m => {
      clearTimeout(timer)
      const map = withStarted(ids, m)
      cache.set(key, map)
      if (alive) setState({ key, map, ready: true })
    })
    // Пока схема на экране — те же события и в её состояние (кэш правит
    // общий слушатель выше, здесь только перерисовка)
    const onChange = e => {
      if (!ids.includes(e.detail?.lessonId)) return
      if (alive) setState(s => (s.key === key ? { ...s, map: cache.get(key) ?? applyChange(s.map, e.detail) } : s))
    }
    window.addEventListener(PROGRESS_EVENT, onChange)
    return () => { alive = false; clearTimeout(timer); window.removeEventListener(PROGRESS_EVENT, onChange) }
  }, [key])

  return state
}
