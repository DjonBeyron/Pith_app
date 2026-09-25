import { useState, useEffect, useCallback } from 'react'
import { listWordMemory, listRecentReviews, getMemoryProfile } from '../../shared/api/memoryApi.js'
import { loadCurricula } from '../../shared/lib/curriculaApi.js'
import { listLessonDeckFlags } from '../../shared/lib/lessonsApi.js'
import { localToday } from '../review/reviewDecks.js'
import { buildLearnView } from './learnView.js'

// Данные вкладки «Моё обучение» (learnView.js), включая «Отпуск». Живут в оболочке (ShellV2):
// по ним же — точка на вкладке «есть что повторить». Обновляются при входе
// (enabled — залогинен), по reload (закрыли повторение, вернулись на
// вкладку) и при возврате в приложение — дата могла смениться.
// view: null — загрузка или гость
export function useLearnData(enabled) {
  const [view, setView] = useState(null)
  const [error, setError] = useState(false)

  const reload = useCallback(async () => {
    try {
      const [memory, curricula, lessons, reviews, { minutes, vacationSince }] = await Promise.all([
        listWordMemory(), loadCurricula(), listLessonDeckFlags(), listRecentReviews(7), getMemoryProfile(),
      ])
      setView(buildLearnView({ memory, curricula, lessons, reviews, minutes, vacationSince }, localToday()))
      setError(false)
    } catch (e) {
      console.error('[LEARN] загрузка:', e?.message)
      setError(true)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- загрузка данных вкладки
    reload()
    const onVisible = () => { if (document.visibilityState === 'visible') reload() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [enabled, reload])

  return { view: enabled ? view : null, error, reload }
}
