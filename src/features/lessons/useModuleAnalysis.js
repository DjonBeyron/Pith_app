import { useState, useEffect } from 'react'
import { loadAllEvents } from '../../shared/lib/skillStatsStore.js'
import { computeAllPriorities } from '../../shared/lib/skillScore.js'
import { getLocalStars } from '../../shared/lib/lessonStars.js'
import { fetchMyLessonStars } from '../../shared/api/starsApi.js'

// Карта звёзд уроков: максимум локального стора (мгновенно, работает и гостю)
// и сервера (переносится между устройствами).
async function loadStarsMap(user, lessons) {
  const merged = new Map(getLocalStars())
  if (user && lessons.length > 2) {
    const server = await fetchMyLessonStars(lessons.slice(1, -1).map(l => l.id))
    server.forEach((v, id) => merged.set(id, Math.max(v, merged.get(id) ?? 0)))
  }
  return merged
}

// Приоритеты уроков (анализ знаний) + звёзды (локальные+серверные, максимум)
// для схемы модуля — с флагами готовности: граф ждёт оба перед первым
// показом, иначе полоска приоритета/звёзды подъезжают отдельным рендером уже
// поверх видимой схемы и меняют высоту карточек — заметный скачок интерфейса.
// readyTimeout — страховка: оба грузятся с сервера, на плохой сети не должны
// блокировать вход в модуль навсегда. Вынесено из CurriculumView.jsx.
export function useModuleAnalysis({ isPro, lessons, user }) {
  const [priorities,      setPriorities]      = useState(null)
  const [stars,           setStars]           = useState(null)
  const [prioritiesReady, setPrioritiesReady] = useState(false)
  const [starsReady,      setStarsReady]      = useState(false)
  const [readyTimeout,    setReadyTimeout]    = useState(false)

  // Возвращает promise с картой приоритетов — вызывающий может дождаться
  // пересчёта до показа графа и решить, показывать ли легенду
  function refreshPriorities() {
    return loadAllEvents()
      .then(events => {
        const map = computeAllPriorities(events)
        setPriorities(map)
        return map
      })
      .catch(() => null)
      .finally(() => setPrioritiesReady(true))
  }

  // Звёзды: при загрузке уроков и после каждого прохождения (локальный стор
  // уже обновлён плеером к моменту вызова).
  const refreshStars = (ls = lessons) =>
    loadStarsMap(user, ls).then(setStars).finally(() => setStarsReady(true))

  useEffect(() => {
    if (!isPro && lessons.length > 0) refreshStars(lessons)
  }, [lessons, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { refreshPriorities() }, [])

  useEffect(() => {
    if (isPro) return
    const t = setTimeout(() => setReadyTimeout(true), 1500)
    return () => clearTimeout(t)
  }, [isPro])

  return { priorities, stars, prioritiesReady, starsReady, readyTimeout, refreshPriorities, refreshStars }
}
