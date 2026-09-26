import { awardModuleTicket } from '../../shared/api/ticketApi.js'
import { starsFromErrors, setLocalStars } from '../../shared/lib/lessonStars.js'
import { saveLessonStars } from '../../shared/api/starsApi.js'
import { addLocalXp, getLocalXp } from '../../shared/lib/localProfile.js'
import { completeLesson, getProfile } from '../../shared/api/profileApi.js'
import { bumpStreakOnLesson } from '../../shared/api/streakApi.js'
import { markFirstDay } from '../streak/firstDaySignal.js'
import { refreshProfile } from '../../shared/api/profileCache.js'
import { saveAnswerEvents } from '../../shared/lib/skillStatsStore.js'
import { sendSelfTrigger } from '../../shared/api/pushApi.js'
import { getCurrentLevel } from '../../shared/lib/xpLevels.js'
import { pLog } from '../../shared/lib/debug.js'
import { hasMemoryWord } from '../../shared/api/memoryApi.js'

// Счёт для onFinishStats (супергонка, карточка повторения) в момент финиша:
// errors — неверные ответы с привязкой к уроку-цели (события анализа),
// wrong — все неверные ответы (у карточки повторения привязок нет),
// timeMs — от открытия плеера. Отдельной функцией, а не в коллбэке плеера:
// Date.now там компилятор React принимал за вызов в рендере
export function finishStatsOf({ getEvents, wrongRef, openTimeRef }) {
  return {
    errors: getEvents().filter(e => e.type === 'wrong').length,
    wrong: wrongRef.current,
    timeMs: Date.now() - openTimeRef.current,
  }
}

// Конец урока: начисление XP (гостю — локально, залогиненному — сервером
// через completeLesson), звёзды по ошибкам, золотой билет за Финал модуля,
// запись событий анализа знаний, пуш себе при переходе на новый уровень.
// memoryWord — слово урока-слова модуля (CurriculumView): если его не было в
// памяти, а после зачёта оно там (залогиненному заносит серверный триггер,
// гостю — схема модуля по «Закрыть»), итог покажет «Новое слово во временной
// памяти» (setNewWord). Вынесено из LessonPlayer.jsx.
export function useLessonFinish({
  edit, starsEligible, lessonId, wrongRef, finalTicket, getHintCount, getEvents, earnedXpRef,
  setBaseXp, setEarnedXp, setStarsRes, setShowSummary, setTicketRes, clearProgress,
  memoryWord = null, setNewWord = () => {},
}) {
  function finishSummary() {
    // Прогон из канваса — инструмент автора, а не прохождение урока: ни экрана
    // итогов, ни начислений (XP, звёзды, золотой билет), ни записи в анализ
    // знаний, ни выхода в схему модуля. Плеер просто остаётся открытым —
    // закроет его сам админ, когда досмотрит
    if (edit) {
      pLog('[player] конец урока в режиме правки из канваса — итоги не показываем')
      return
    }
    // Урок реально пройден целиком — чекпойнт «докуда дошёл» больше не нужен
    clearProgress?.()
    setTimeout(async () => {
      // Звёзды обычного урока: считаются и гостю, и залогиненному; локальный
      // стор обновляется сразу (схема модуля покажет без похода на сервер)
      let stars = null
      if (starsEligible && lessonId) {
        stars = { earned: starsFromErrors(wrongRef.current), best: 0 }
        setLocalStars(lessonId, stars.earned)
      }
      const profile = await getProfile()
      if (profile) {
        // Залогинен: XP начисляет сервер по своей копии урока, один раз за урок.
        // Без lessonId (предпросмотр в редакторе) начисления нет.
        setBaseXp(profile.xp)
        const hadWord = memoryWord ? await hasMemoryWord(memoryWord) : null
        const awarded = lessonId ? await completeLesson(lessonId) : 0
        if (hadWord === false && await hasMemoryWord(memoryWord)) setNewWord(memoryWord)
        // День серии закрывает именно пройденный урок, а не заход в
        // приложение (см. миграцию 20260831120000_streak_by_lesson.sql).
        // Идемпотентно: второй урок за сутки ничего не добавит
        if (lessonId) {
          const bump = await bumpStreakOnLesson()
          // Самый первый закрытый день в жизни аккаунта (серия и рекорд по
          // единице) — схема уроков покажет окно «Путь начался» после своей
          // анимации, см. firstDaySignal.js
          if (bump?.incremented && bump.streak === 1 && (bump.longest ?? 1) === 1) markFirstDay()
        }
        // События анализа — после completeLesson: он создаёт строку lesson_results
        await saveAnswerEvents(getEvents(), { sourceLessonId: lessonId, isLoggedIn: true })
        // Финал модуля: выдача золотого билета (после completeLesson — сервер
        // проверяет lesson_results). Итог показывается в LessonSummary.
        if (finalTicket?.moduleId) {
          const hints = getHintCount()
          const t = await awardModuleTicket(finalTicket.moduleId, hints)
          if (t) setTicketRes({ ...t, hints })
        }
        // Звёзды на сервер — после completeLesson (он создаёт строку
        // lesson_results); сервер вернёт лучший результат (только вверх)
        if (stars) stars.best = await saveLessonStars(lessonId, stars.earned)
        setEarnedXp(awarded)
        refreshProfile() // фоном обновляем кэш — вкладка «Профиль» откроется уже со свежим XP
        // Пересечение уровня — системное пуш-поздравление самому себе
        // (шаблон level_up в админке; без подписки функция просто ничего не шлёт)
        if (awarded > 0) {
          const lvl = getCurrentLevel(profile.xp + awarded).level
          if (lvl > getCurrentLevel(profile.xp).level) sendSelfTrigger('level_up', { level: lvl })
        }
      } else {
        // Гость: локальный XP как демо (на сервер не влияет).
        const earned = earnedXpRef.current
        setBaseXp(getLocalXp())
        if (earned > 0) addLocalXp(earned)
        saveAnswerEvents(getEvents(), { sourceLessonId: lessonId, isLoggedIn: false })
        setEarnedXp(earned)
        // Гостю слово заносит схема модуля по «Закрыть» — здесь только «ещё нет»
        if (memoryWord && await hasMemoryWord(memoryWord) === false) setNewWord(memoryWord)
      }
      if (stars) setStarsRes(stars)
      setShowSummary(true)
    }, 2000)
  }

  return { finishSummary }
}
