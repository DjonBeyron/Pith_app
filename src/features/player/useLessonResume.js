import { useState, useEffect } from 'react'
import { getLessonProgress, saveLessonProgress, clearLessonProgress } from '../../shared/lib/lessonProgressApi.js'
import { getCompletedLessons } from '../../shared/lib/completedLessons.js'
import { pLog } from '../../shared/lib/debug.js'

// Универсальный чекпойнт «докуда дошёл в уроке» — работает для ЛЮБОГО входа
// в LessonPlayer (модуль, standalone-урок, гонка), не только для новой ноды
// lesson_ref. Не участвует, если урок не идентифицирован (превью в канвасе),
// открыт в режиме правки (edit), или уже пройден — повтор пройденного урока
// всегда идёт с начала, это обычный режим пересдачи, а не «продолжить».
//
// lessonId у одного смонтированного LessonPlayer не меняется (новый урок —
// это новый маунт, см. CurriculumView.jsx/StandaloneLessonRunner.jsx) —
// поэтому проверка чекпойнта запускается ровно один раз на маунт.
// onResume(xp) — сигнал наверх «вот сколько XP уже накоплено к моменту
// сохранённого чекпойнта» (см. checkpoint ниже), чтобы LessonPlayer.jsx мог
// засеять им earnedXpRef. Колбэк, а не просто resumeOffer.xp напрямую: resume()
// зовётся синхронно из клика по «Продолжить», и колбэк обновляет earnedXpRef/
// earnedXp в ТОМ ЖЕ рендере — без отдельного эффекта и вспышки «0 XP».
// skipCheck — чекпойнт уже решён ДО плеера, в самой карточке запуска
// (LessonLaunchCard.jsx/LaunchCtaSlot.jsx — та же проверка, но ДО прогрева,
// чтобы он целился в нужное место). Плеер получает готовый startNodeId
// пропом — свою проверку (и старый попап ResumeLessonPopup) не показывает
// вовсе, только остаётся резервным путём для входов мимо карточки запуска
export function useLessonResume(lessonId, edit, onResume, skipCheck = false) {
  const active = !!lessonId && !edit
  // already-completed — синхронное чтение localStorage, не сеть: можно в
  // ленивом инициализаторе, это не побочный эффект
  const [checking, setChecking] = useState(() => active && !skipCheck && !getCompletedLessons().has(lessonId))
  const [resumeOffer, setResumeOffer] = useState(null) // { nodeId, pct, xp, visitedIds } | null
  const [startNodeId, setStartNodeId] = useState(null)
  // Id нод, показанных ДО точки входа — restore истории чата (useGraphPlayer.js).
  // Сама точка входа (startNodeId) сюда не входит — её заводит живой граф
  const [historyIds, setHistoryIds] = useState(null)

  useEffect(() => {
    if (!checking) return
    let cancelled = false
    getLessonProgress(lessonId).then(p => {
      if (cancelled) return
      if (p?.nodeId) {
        const visitedIds = p.visitedIds ?? []
        pLog(`[resume] чекпойнт найден: nodeId=${p.nodeId} pct=${p.pct ?? 0}% xp=${p.xp ?? 0} история=${visitedIds.length} нод`)
        setResumeOffer({ nodeId: p.nodeId, pct: p.pct ?? 0, xp: p.xp ?? 0, visitedIds })
      }
      setChecking(false)
    })
    return () => { cancelled = true }
    // checking намеренно не в зависимостях: эффект должен сработать один раз
    // на этот lessonId (на маунте), а не повторно, когда сам же выставит false
  }, [lessonId]) // eslint-disable-line react-hooks/exhaustive-deps

  function resume() {
    setStartNodeId(resumeOffer.nodeId)
    // Последний id в visitedIds — сама точка входа (см. checkpoint ниже),
    // историей становится всё, что шло до него
    const before = resumeOffer.visitedIds.slice(0, -1)
    if (before.length) setHistoryIds(before)
    // Гостю (у залогиненного сервер сам считает итоговый XP — см.
    // useLessonFinish.js) без этого XP, заработанный ДО закрытия урока,
    // терялся: фид продолжения не переигрывает старые ноды, их onXpEarned
    // больше не выстрелит, а earnedXpRef у нового монтирования плеера — 0
    if (resumeOffer.xp > 0) onResume?.(resumeOffer.xp)
    setResumeOffer(null)
  }
  function restart() {
    if (lessonId) clearLessonProgress(lessonId)
    setResumeOffer(null)
  }
  // useGraphPlayer.js зовёт это после 6-й показанной ноды (через LessonPlayer.jsx,
  // который сам считает pct по mainIndex — держим сеть и граф вне этого хука).
  // Пишется и во время пересдачи УЖЕ пройденного урока — см. заголовок файла:
  // это и есть сигнал «на паузе снова» для «Мои уроки». xp — earnedXpRef.current
  // на момент чекпойнта (см. onResume выше), visitedIds — все показанные id
  // по порядку, ПОСЛЕДНИЙ из них и есть nodeId
  function checkpoint(nodeId, pct, xp, visitedIds) {
    if (active) saveLessonProgress(lessonId, nodeId, pct, xp, visitedIds)
  }
  function clear() {
    if (active) clearLessonProgress(lessonId)
  }

  return { checking, resumeOffer, startNodeId, historyIds, resume, restart, checkpoint, clear }
}
