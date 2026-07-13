import { useEffect, useRef, useState } from 'react'
import { loadCurricula } from '../../shared/lib/curriculaApi.js'
import { fdbg } from '../../shared/lib/feedDebug.js'

// Загрузка модулей (curricula) + deep-link репоста (/?m=<id>) + расчёт
// круга рекомендаций (не начатые модули, повёрнутые к расшаренной фразе)
export function useFeedModules(startedIds) {
  const [modules, setModules] = useState(null) // null = загрузка
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    loadCurricula()
      .then(rows => {
        if (cancelled) return
        // Восстанавливаем lesson_ids в localStorage (как useCurricula в старой
        // вкладке): CurriculumView читает уроки модуля именно оттуда — без
        // этого «Изучить фразу» на свежем устройстве открывал пустую схему
        rows.forEach(r => {
          const key = `curr_lessons_${r.id}`
          const local = JSON.parse(localStorage.getItem(key) ?? '[]')
          if ((r.lesson_ids?.length ?? 0) > 0 && local.length === 0) {
            localStorage.setItem(key, JSON.stringify(r.lesson_ids))
          }
        })
        // Черновики в ленту не попадают (и у админа тоже — честное превью)
        const published = rows.filter(r => r.published)
        // Приоритетно готовим первый кадр ленты: прелоадим постер первого
        // модуля — чтобы за анимацией стартового сплэша уже был контент
        const firstPoster = published.find(r => r.poster_url)?.poster_url
        if (firstPoster) { const im = new Image(); im.src = firstPoster }
        setModules(published.map(r => ({
          id: r.id,
          title: r.title,
          lessonIds: r.lesson_ids ?? [],
          videoUrl: r.video_url ?? null,
          posterUrl: r.poster_url ?? null,
          posterCrop: r.poster_crop ?? null,
          difficulty: r.difficulty ?? null,
          difficultyVotes: r.difficulty_votes ?? 0,
        })))
      })
      .catch(e => {
        if (cancelled) return
        setError(e.message)
        setModules([])
      })
    return () => { cancelled = true }
  }, [])

  // Deep-link репоста (/?m=<id>): лента начинается с расшаренной фразы.
  // Круг бесконечный, поэтому просто поворачиваем список — фраза первой,
  // остальное следом. Если модуль не в рекомендациях (начат/черновик) —
  // лента обычная. Параметр убираем из адресной строки, но помним в ref.
  const deepLinkRef = useRef(new URLSearchParams(location.search).get('m'))
  useEffect(() => {
    if (deepLinkRef.current) {
      fdbg('deep-link: старт с модуля', deepLinkRef.current)
      history.replaceState(null, '', location.pathname)
    }
  }, [])

  // Круг рекомендаций — только не начатые модули
  let feedModules = (modules ?? []).filter(m => !startedIds.has(m.id))
  if (deepLinkRef.current) {
    const dlIdx = feedModules.findIndex(m => m.id === deepLinkRef.current)
    if (dlIdx > 0) {
      feedModules = [...feedModules.slice(dlIdx), ...feedModules.slice(0, dlIdx)]
    } else if (dlIdx === -1) {
      // Модуль начат (например, отправитель открыл свою же ссылку) — в
      // рекомендациях его нет, но по прямой ссылке показываем всё равно
      const dlMod = (modules ?? []).find(m => m.id === deepLinkRef.current)
      if (dlMod) feedModules = [dlMod, ...feedModules]
    }
  }

  return { modules, error, feedModules, len: feedModules.length }
}
