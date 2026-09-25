import { useState, useEffect, useCallback } from 'react'
import { listWordMemory, listRecentReviews, getMemoryProfile, importGuestMemory } from '../../shared/api/memoryApi.js'
import { hasGuestMemory } from '../../shared/lib/memory/guestMemory.js'
import { loadCurricula } from '../../shared/lib/curriculaApi.js'
import { listLessonDeckFlags } from '../../shared/lib/lessonsApi.js'
import { localToday } from '../review/reviewDecks.js'
import { buildLearnView } from './learnView.js'

// Данные вкладки «Моё обучение» (learnView.js), включая «Отпуск». Живут в
// оболочке (ShellV2): по ним же — точка на вкладке «есть что повторить».
// Гостю — тоже: его память локальная (memoryApi сам уходит в guestMemory.js).
// Вошёл (isLoggedIn стал true) — память гостя переносится в аккаунт.
// Обновляются по reload (закрыли повторение, вернулись на вкладку) и при
// возврате в приложение — дата могла смениться. view: null — загрузка
export function useLearnData(isLoggedIn) {
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
    // Вход/выход: сперва перенести память гостя (если была), потом перечитать
    const move = isLoggedIn && hasGuestMemory() ? importGuestMemory() : Promise.resolve()
    move.then(reload).catch(() => {})
    const onVisible = () => { if (document.visibilityState === 'visible') reload() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [isLoggedIn, reload])

  return { view, error, reload }
}
