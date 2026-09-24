import { useEffect, useState } from 'react'
import { listLessonsWithProgress, PROGRESS_EVENT } from '../../shared/lib/lessonProgressApi.js'

// Начатые уроки схемы модуля: lessonId → pct (0..100) из чекпойнта «докуда
// дошёл» (lessonProgressApi.js). Один запрос на весь список при открытии
// схемы; дальше — точечно по событию сохранения/сброса чекпойнта, без
// новых запросов (урок идёт поверх схемы, она остаётся смонтированной).
export function useLessonsProgress(lessonIds) {
  const key = lessonIds.join('|')
  const [map, setMap] = useState(() => new Map())

  useEffect(() => {
    let alive = true
    const ids = key ? key.split('|') : []
    listLessonsWithProgress(ids).then(m => { if (alive) setMap(m) })
    const onChange = e => {
      const { lessonId, pct } = e.detail || {}
      if (!ids.includes(lessonId)) return
      setMap(prev => {
        const next = new Map(prev)
        if (pct == null) next.delete(lessonId)
        else next.set(lessonId, pct)
        return next
      })
    }
    window.addEventListener(PROGRESS_EVENT, onChange)
    return () => { alive = false; window.removeEventListener(PROGRESS_EVENT, onChange) }
  }, [key])

  return map
}
