// Расчёт приоритетов уроков по логу событий ответов (см. SKILL_ANALYSIS.md §5).
// Чистые функции без React и сети — покрыты юнит-тестами (skillScore.test.js).
//
// Событие:
// {
//   lessonId,        // урок-цель (кому уходят данные ответа)
//   type,            // 'correct' | 'wrong' | 'know' | 'dont_know'
//   attempt,         // номер попытки внутри урока-цели в рамках сессии (с 1)
//   timeMs,          // от появления панели до первого клика
//   option,          // что именно выбрал/собрал (для будущего анализа)
//   sessionId,       // id прохождения урока-источника
//   sourceLessonId,  // урок-источник (где отвечал)
//   at,              // ISO-дата
// }

export const THRESHOLD_SLOW = 15000 // мс; «верно, но долго думал» → medium
export const ATTEMPTS_OK = 1        // с какой попытки ответ ещё «чистый»

// Каскад правил для копилки ОДНОГО урока (события последней сессии, в
// хронологическом порядке). Возвращает 'high' | 'medium' | 'low' | null.
export function computePriority(events) {
  if (!events?.length) return null

  const lastIdx = (type) => {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === type) return i
    }
    return -1
  }
  const lastWrong   = lastIdx('wrong')
  const lastCorrect = lastIdx('correct')
  const hasDontKnow = events.some(e => e.type === 'dont_know')
  const hasKnow     = events.some(e => e.type === 'know')

  // Свежее сильнее старого: ошибка без последующего верного ответа — high.
  // Покрывает и «correct → wrong» (знание не удержалось), и «know → wrong»
  // (факт сильнее самооценки).
  if (lastWrong > lastCorrect) return 'high'

  if (lastCorrect >= 0) {
    const shaky = events.some(e =>
      e.type === 'correct' &&
      ((e.attempt ?? 1) > ATTEMPTS_OK || (e.timeMs ?? 0) > THRESHOLD_SLOW)
    )
    return (shaky || hasDontKnow) ? 'medium' : 'low'
  }

  // Фактических ответов не было — только самооценка.
  if (hasDontKnow) return 'medium'
  if (hasKnow) return 'low' // «слабый» low: первая же ошибка позже перекрасит
  return null
}

// Оставляет события последней сессии каждого урока-источника (пересдача
// «с обновлением» замещает старую диагностику). Порядок событий сохраняется.
export function latestSessionEvents(allEvents) {
  const lastSession = new Map() // sourceLessonId → sessionId последнего события
  for (const e of allEvents) {
    lastSession.set(e.sourceLessonId, e.sessionId)
  }
  return allEvents.filter(e => lastSession.get(e.sourceLessonId) === e.sessionId)
}

// Полный расчёт: весь лог → Map<lessonId, 'high' | 'medium' | 'low'>.
// Уроки без событий в Map не попадают (полоска не рисуется).
export function computeAllPriorities(allEvents) {
  const actual = latestSessionEvents(allEvents ?? [])
  const byLesson = new Map()
  for (const e of actual) {
    if (!e.lessonId) continue
    if (!byLesson.has(e.lessonId)) byLesson.set(e.lessonId, [])
    byLesson.get(e.lessonId).push(e)
  }
  const result = new Map()
  for (const [lessonId, events] of byLesson) {
    const p = computePriority(events)
    if (p) result.set(lessonId, p)
  }
  return result
}
