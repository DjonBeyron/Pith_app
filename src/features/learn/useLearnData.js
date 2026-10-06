import { isLessonOpen, onLessonOpenChange } from '../../shared/lib/lessonOpen.js'
import { useState, useEffect, useCallback } from 'react'
import { listWordMemory, listRecentReviews, getMemoryProfile, importGuestMemory, listPhraseRows } from '../../shared/api/memoryApi.js'
import { fetchStartedModules } from '../../shared/api/moduleSocialApi.js'
import { fetchMyDoneLessonIds } from '../../shared/api/starsApi.js'
import { getCompletedLessons } from '../../shared/lib/completedLessons.js'
import { hasGuestMemory } from '../../shared/lib/memory/guestMemory.js'
import { loadCurricula } from '../../shared/lib/curriculaApi.js'
import { listLessonDeckFlags } from '../../shared/lib/lessonsApi.js'
import { localToday } from '../review/reviewDecks.js'
import { onMemoryChanged } from '../../shared/lib/memoryChangedEvent.js'
import { buildLearnView } from './learnView.js'

// Данные вкладки «Моё обучение» (learnView.js), включая «Отпуск». Живут в
// оболочке (ShellV2): по ним же — точка на вкладке «есть что повторить».
// Гостю — тоже: его память локальная (memoryApi сам уходит в guestMemory.js).
// Вошёл (isLoggedIn стал true) — память гостя переносится в аккаунт.
// Обновляются по reload (закрыли повторение, вернулись на вкладку), при
// возврате в приложение — дата могла смениться, и по сигналу «память изменилась»
// (memoryChangedEvent.js: тест-инструменты админа — «＋ В обучение», «Прожить день»…): точка на
// нижней панели и вкладка обновляются сразу, не дожидаясь захода на вкладку. view: null — загрузка
export function useLearnData(isLoggedIn) {
  const [view, setView] = useState(null)
  const [error, setError] = useState(false)

  const reload = useCallback(async () => {
    try {
      const [memory, curricula, lessons, reviews, { minutes, vacationSince }, phraseRows, startedIds, doneIds] = await Promise.all([
        listWordMemory(), loadCurricula(), listLessonDeckFlags(), listRecentReviews(14), getMemoryProfile(), listPhraseRows(),
        fetchStartedModules().catch(() => new Set()), fetchMyDoneLessonIds().catch(() => []),
      ])
      const doneLessons = new Set([...getCompletedLessons(), ...doneIds])
      setView(buildLearnView({ memory, curricula, lessons, reviews, minutes, vacationSince, phraseRows, startedIds, doneLessons }, localToday()))
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
    // Возврат из фона посреди урока: 8 запросов и перерисовка всей оболочки
    // (с плеером внутри) — откладываем до закрытия урока
    let deferred = false
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (isLessonOpen()) { deferred = true; return }
      reload()
    }
    document.addEventListener('visibilitychange', onVisible)
    const offMemory = onMemoryChanged(reload)
    const offLesson = onLessonOpenChange(open => { if (!open && deferred) { deferred = false; reload() } })
    return () => { document.removeEventListener('visibilitychange', onVisible); offMemory(); offLesson() }
  }, [isLoggedIn, reload])

  return { view, error, reload }
}
