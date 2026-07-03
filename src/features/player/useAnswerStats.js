import { useRef, useCallback } from 'react'
import { pLog } from '../../shared/lib/debug.js'

// Сбор событий ответов для анализа знаний (SKILL_ANALYSIS.md §4).
// Копит события в памяти за одну сессию плеера; сохранение — этап 3.
// Таймер: от появления панели (panelShown) до ответа; после каждого ответа
// таймер той же ноды перезапускается — следующая попытка меряется отдельно.

// Событие из выбранного варианта ноды «Выбор слова»:
// сигнал варианта → know/dont_know; иначе, если у ноды есть ✓-варианты —
// correct/wrong по галочке; урок — свой у варианта или общий у ноды.
export function wordOptionEvent(node, option) {
  const wc = node.typeData?.word_choice ?? {}
  const lessonId = option.statLessonId ?? wc.statLessonId ?? null
  let type = null
  if (option.signal === 'know')           type = 'know'
  else if (option.signal === 'dont_know') type = 'dont_know'
  else if ((wc.options ?? []).some(o => o.isCorrect)) {
    type = option.isCorrect ? 'correct' : 'wrong'
  }
  return { lessonId, type, option: option.text ?? '' }
}

export function useAnswerStats({ sourceLessonId = null, enabled = true } = {}) {
  const sessionIdRef = useRef(null) // лениво: генерится при первом событии, не в рендере
  const eventsRef    = useRef([])
  const shownAtRef   = useRef({}) // nodeId → performance.now() появления панели
  const attemptRef   = useRef({}) // lessonId → счётчик фактических попыток (correct/wrong)

  function sessionId() {
    if (!sessionIdRef.current) {
      sessionIdRef.current = `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    }
    return sessionIdRef.current
  }

  const panelShown = useCallback((nodeId) => {
    if (!nodeId || shownAtRef.current[nodeId] != null) return
    shownAtRef.current[nodeId] = performance.now()
  }, [])

  const record = useCallback(({ nodeId, lessonId, type, option = '' }) => {
    if (!enabled) return
    if (!lessonId || !type) {
      // Диагностика для админа: почему ответ не дал события
      pLog(`[stats] пропущено (${!lessonId ? 'нет привязки «→ Урок»' : 'нет ✓-варианта и нет сигнала'}) «${option}»`)
      return
    }
    const shownAt = shownAtRef.current[nodeId]
    const timeMs  = shownAt != null ? Math.round(performance.now() - shownAt) : null
    shownAtRef.current[nodeId] = performance.now()

    let attempt = 1
    if (type === 'correct' || type === 'wrong') {
      attempt = (attemptRef.current[lessonId] ?? 0) + 1
      attemptRef.current[lessonId] = attempt
    }

    eventsRef.current.push({
      lessonId, type, attempt, timeMs, option,
      sessionId: sessionId(),
      sourceLessonId,
      at: new Date().toISOString(),
    })
    pLog(`[stats] ${type} урок=${lessonId} попытка=${attempt} время=${timeMs ?? '?'}мс «${option}»`)
  }, [enabled, sourceLessonId])

  const getEvents = useCallback(() => [...eventsRef.current], [])

  return { panelShown, record, getEvents }
}
