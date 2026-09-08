import { useState, useEffect } from 'react'
import { getLessonProgress, saveLessonProgress, clearLessonProgress } from '../../shared/lib/lessonProgressApi.js'
import { getCompletedLessons } from '../../shared/lib/completedLessons.js'

// Универсальный чекпойнт «докуда дошёл в уроке» — работает для ЛЮБОГО входа
// в LessonPlayer (модуль, standalone-урок, гонка), не только для новой ноды
// lesson_ref. Не участвует, если урок не идентифицирован (превью в канвасе),
// открыт в режиме правки (edit), или уже пройден — повтор пройденного урока
// всегда идёт с начала, это обычный режим пересдачи, а не «продолжить».
//
// lessonId у одного смонтированного LessonPlayer не меняется (новый урок —
// это новый маунт, см. CurriculumView.jsx/StandaloneLessonRunner.jsx) —
// поэтому проверка чекпойнта запускается ровно один раз на маунт.
export function useLessonResume(lessonId, edit) {
  const active = !!lessonId && !edit
  // already-completed — синхронное чтение localStorage, не сеть: можно в
  // ленивом инициализаторе, это не побочный эффект
  const [checking, setChecking] = useState(() => active && !getCompletedLessons().has(lessonId))
  const [resumeOffer, setResumeOffer] = useState(null) // { nodeId, pct } | null
  const [startNodeId, setStartNodeId] = useState(null)

  useEffect(() => {
    if (!checking) return
    let cancelled = false
    getLessonProgress(lessonId).then(p => {
      if (cancelled) return
      if (p?.nodeId) setResumeOffer({ nodeId: p.nodeId, pct: p.pct ?? 0 })
      setChecking(false)
    })
    return () => { cancelled = true }
    // checking намеренно не в зависимостях: эффект должен сработать один раз
    // на этот lessonId (на маунте), а не повторно, когда сам же выставит false
  }, [lessonId]) // eslint-disable-line react-hooks/exhaustive-deps

  function resume() {
    setStartNodeId(resumeOffer.nodeId)
    setResumeOffer(null)
  }
  function restart() {
    if (lessonId) clearLessonProgress(lessonId)
    setResumeOffer(null)
  }
  // useGraphPlayer.js зовёт это после 6-й показанной ноды (через LessonPlayer.jsx,
  // который сам считает pct по mainIndex — держим сеть и граф вне этого хука).
  // Пишется и во время пересдачи УЖЕ пройденного урока — см. заголовок файла:
  // это и есть сигнал «на паузе снова» для «Мои уроки»
  function checkpoint(nodeId, pct) {
    if (active) saveLessonProgress(lessonId, nodeId, pct)
  }
  function clear() {
    if (active) clearLessonProgress(lessonId)
  }

  return { checking, resumeOffer, startNodeId, resume, restart, checkpoint, clear }
}
