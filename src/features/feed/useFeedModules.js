import { useEffect, useState, useRef, useCallback } from 'react'
import { loadCurricula } from '../../shared/lib/curriculaApi.js'
import { fdbg } from '../../shared/lib/feedDebug.js'

// Загрузка модулей (curricula) + «пин» на фразу (deep-link репоста /?m=<id>,
// либо программный поворот из поиска — см. jumpTo) + расчёт круга
// рекомендаций (не начатые модули, повёрнутые к закреплённой фразе)
export function useFeedModules(startedIds, visible = true) {
  const [modules, setModules] = useState(null) // null = загрузка
  const [error, setError] = useState('')

  const load = useCallback(() => {
    return loadCurricula()
      .then(rows => {
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
      // Сбой перезагрузки (сеть) — существующий список НЕ стираем
      .catch(e => { setError(e.message); setModules(prev => prev ?? []) })
  }, [])

  // Начальная загрузка
  useEffect(() => { load() }, [load])

  // Бэкграунд-обновление (баг: опубликованный модуль не появлялся до
  // перезагрузки приложения): тихо перечитываем список без скелетона —
  // (1) при возврате в ленту (visible false→true: админ опубликовал в
  // «Админ» и вернулся; пользователь переключил вкладку), (2) когда
  // приложение выходит из фона (тап по пушу «новый модуль» → foreground).
  const prevVisible = useRef(visible)
  useEffect(() => {
    if (visible && !prevVisible.current) load()
    prevVisible.current = visible
  }, [visible, load])

  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible' && visible) load() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [visible, load])

  // Закреплённая фраза: изначально из deep-link репоста (/?m=<id>), потом
  // может меняться программно — тап по результату поиска (jumpTo). Круг
  // бесконечный, поэтому просто поворачиваем список — фраза первой,
  // остальное следом. Если модуль не в рекомендациях (начат/черновик) —
  // всё равно показываем её (как и с репостом). State (не ref!): смена
  // должна вызвать перерисовку и реальный поворот ленты (см. useFeedVirtualizer)
  const [pinnedId, setPinnedId] = useState(() => new URLSearchParams(location.search).get('m'))
  useEffect(() => {
    if (pinnedId) {
      fdbg('deep-link: старт с модуля', pinnedId)
      history.replaceState(null, '', location.pathname)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Поворот ленты к фразе (используется поиском): просто меняем закреплённый id
  function jumpTo(id) { setPinnedId(id) }

  // Круг рекомендаций — только не начатые модули
  let feedModules = (modules ?? []).filter(m => !startedIds.has(m.id))
  if (pinnedId) {
    const dlIdx = feedModules.findIndex(m => m.id === pinnedId)
    if (dlIdx > 0) {
      feedModules = [...feedModules.slice(dlIdx), ...feedModules.slice(0, dlIdx)]
    } else if (dlIdx === -1) {
      // Модуль начат (например, отправитель открыл свою же ссылку) — в
      // рекомендациях его нет, но по прямой ссылке (или из поиска) показываем всё равно
      const dlMod = (modules ?? []).find(m => m.id === pinnedId)
      if (dlMod) feedModules = [dlMod, ...feedModules]
    }
  }

  return { modules, error, feedModules, len: feedModules.length, pinnedId, jumpTo }
}
