import { useState } from 'react'
import { getCompletedLessons, unmarkLessons } from '../../shared/lib/completedLessons.js'
import { simulateLessonsDone } from '../../shared/lib/adminTestCompletion.js'
import { refreshProfile } from '../../shared/api/profileCache.js'
import { resetLessonProgress } from '../../shared/api/profileApi.js'
import { clearLocalEvents } from '../../shared/lib/skillStatsStore.js'
import { unmarkModuleStarted } from '../../shared/api/moduleSocialApi.js'
import { relockModule } from '../../shared/lib/moduleUnlock.js'
import { dbg } from '../../shared/lib/debug.js'
import { LEGEND_SEEN_KEY } from './priorityLegendSeen.js'

// Тест-инструменты админа в схеме модуля — сброс прохождения (модуль целиком
// и один урок), «пометить пройденным» — и 💾 сохранение структуры, с их
// строкой статуса. Вынесено из CurriculumView.jsx (тот упирался в потолок
// 400 строк); состояние схемы (completedIds, unlocked) остаётся там — сюда
// приходят его сеттеры
export function useModuleAdminActions({
  curriculumId, lessons, isPro, saveStructure, setCompletedIds, setUnlocked, refreshPriorities,
}) {
  const [saving,  setSaving]  = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // Полный сброс модуля (тест-кнопка ⟲): снимает «пройдено» локально и на
  // сервере, отнимает начисленный за эти уроки XP и стирает анализ (события).
  async function handleResetProgress() {
    if (!window.confirm('Сбросить прохождение, XP и анализ уроков этого модуля?')) return
    const ids = lessons.map(l => l.id)
    unmarkLessons(ids)
    setCompletedIds(getCompletedLessons())
    clearLocalEvents(ids)
    // Полный сброс = «как новый пользователь»: легенда покажется снова
    localStorage.removeItem(LEGEND_SEEN_KEY)
    // Модуль больше не «начат» — вернётся в рекомендации
    unmarkModuleStarted(curriculumId)
    // И решение «открыть без диагностики» тоже: сброс обещает состояние нового
    // пользователя, а с ним уроки остались бы открытыми при нулевом прогрессе
    relockModule(curriculumId)
    setUnlocked(false)
    const { refunded, error } = await resetLessonProgress(ids, true) // true = стереть и анализ
    dbg('[RESET] модуль:', ids.length, 'уроков, XP снято:', refunded, 'ошибка:', error)
    if (error) { setSaveMsg(`Сброс на сервере не сработал: ${error}`); setTimeout(() => setSaveMsg(''), 6000) }
    if (refunded > 0) refreshProfile()
    await refreshPriorities()
  }

  // Сброс одного урока (кнопка ⟲ на уроке): снимает только «пройдено» и его XP,
  // анализ (answers) не трогает.
  async function handleResetLesson(id) {
    unmarkLessons([id])
    setCompletedIds(getCompletedLessons())
    const { refunded, error } = await resetLessonProgress([id], false)
    dbg('[RESET] урок:', id, 'XP снято:', refunded, 'ошибка:', error)
    if (error) { setSaveMsg(`Сброс на сервере не сработал: ${error}`); setTimeout(() => setSaveMsg(''), 6000) }
    if (refunded > 0) refreshProfile()
  }

  // Тест-инструмент админа: имитировать «весь модуль пройден» без реального
  // прохождения — см. adminTestCompletion.js (XP на сервере не начисляется)
  function handleMarkAllDone() {
    if (!window.confirm('Тест: пометить ВСЕ уроки модуля пройденными? (без начисления XP)')) return
    simulateLessonsDone(lessons.map(l => l.id))
    setCompletedIds(getCompletedLessons())
  }

  function handleMarkLessonDone(id) {
    simulateLessonsDone([id])
    setCompletedIds(getCompletedLessons())
  }

  async function handleSave() {
    // Защита от ложного «✓ Сохранено»: у обычного модуля всегда есть
    // Старт/Финал. Пустой список = уроки не создались (сбой сети в bulkCreate) —
    // сохранять пустую структуру и рапортовать успех нельзя (так модуль
    // уходил в ленту с «0 уроков»).
    if (!isPro && lessons.length === 0) {
      setSaveMsg('Уроки не созданы (сбой сети?) — обнови страницу и открой модуль заново')
      setTimeout(() => setSaveMsg(''), 6000)
      return
    }
    setSaving(true)
    setSaveMsg('')
    const result = await saveStructure()
    setSaving(false)
    setSaveMsg(result.ok ? '✓ Сохранено' : `Ошибка: ${result.error}`)
    setTimeout(() => setSaveMsg(''), 3000)
  }

  return { saving, saveMsg, handleResetProgress, handleResetLesson, handleMarkAllDone, handleMarkLessonDone, handleSave }
}
