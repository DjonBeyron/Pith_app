import { useEffect, useRef } from 'react'
import { track } from '../../shared/lib/analytics/track.js'

// Аналитика урока: lesson_start при открытии плеера, lesson_finish при
// экране итогов, lesson_abandon — если плеер закрыли (или закрыли само
// приложение) до итогов: pct — докуда дошёл по основной линии урока, это и
// есть «на какой ноде бросают». Прогон из канваса (edit) и предпросмотр без
// lessonId не считаются.
export function useLessonTracking({ lessonId, enabled, progress, finished, resumed }) {
  const progressRef = useRef(progress)
  const startRef = useRef(0)
  const doneRef = useRef(false)
  const on = enabled && !!lessonId

  useEffect(() => { progressRef.current = progress }, [progress])

  useEffect(() => {
    if (!on) return
    startRef.current = Date.now()
    doneRef.current = false
    track('lesson_start', { lesson_id: lessonId, resumed: !!resumed })
    const abandon = () => {
      if (doneRef.current) return
      doneRef.current = true
      track('lesson_abandon', {
        lesson_id: lessonId,
        pct: Math.round((progressRef.current ?? 0) * 100),
        ms: Date.now() - startRef.current,
      })
    }
    window.addEventListener('pagehide', abandon)
    return () => {
      window.removeEventListener('pagehide', abandon)
      abandon()
    }
  }, [on, lessonId]) // eslint-disable-line react-hooks/exhaustive-deps -- resumed важен только в момент старта

  useEffect(() => {
    if (!on || !finished || doneRef.current) return
    doneRef.current = true
    track('lesson_finish', { lesson_id: lessonId, ms: Date.now() - startRef.current })
  }, [on, finished, lessonId])
}
