import { useCallback, useEffect, useRef, useState } from 'react'
import { listLessonBookmarks } from '../../shared/lib/lessonBookmarksApi.js'
import { fetchLessonTitles } from '../../shared/lib/lessonsApi.js'
import { useAuth } from '../../shared/lib/useAuth.js'
import { readCachedBookmarks, writeCachedBookmarks } from './lessonBookmarkCache.js'

// Уроки-закладки для «Моих уроков» — грузятся ТАМ ЖЕ И ТОГДА ЖЕ, где модули:
// при монтировании ленты, а не при открытии вкладки.
//
// Из-за этого и была вся разница. Модуль тяжелее закладки, но его запрос
// (useFeedModules) уходит сразу на старте приложения, а закладки ждали, пока
// пользователь откроет «Мои уроки», и только тогда начинали свои три шага по
// сети: сессия → lesson_bookmarks → названия уроков. Фора в несколько секунд,
// а не объём данных, и делала модули «быстрыми», а урок — appearing позже.
// На телефоне это особенно заметно: сеть медленнее, фора больше.
//
// Зеркало в localStorage осталось подстраховкой на самый первый кадр.
export function useBookmarkedLessons(visible = true) {
  const { user } = useAuth()
  const [list, setList] = useState([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    const bmIds = [...await listLessonBookmarks()]
    const titles = bmIds.length ? await fetchLessonTitles(bmIds) : {}
    setList(bmIds.map(id => ({ id, title: titles[id] ?? 'Урок' })))
    setLoaded(true)
  }, [])

  // Кэш пишем отдельно: запрос стартует раньше, чем становится известен
  // пользователь, а ключ зеркала — по аккаунту. Здесь оба уже на руках
  useEffect(() => {
    if (loaded && user?.id) writeCachedBookmarks(user.id, list)
  }, [loaded, list, user?.id])

  // Старт вместе с лентой — то же место в жизненном цикле, что у модулей.
  // setState в эффекте здесь осознанный: это загрузка данных, как в useFeedModules
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  // Возврат в ленту — тихо перечитываем: закладка могла появиться, пока
  // «Мои уроки» были не видны (переход по ссылке живёт в отдельном дереве,
  // LessonNavOverlay.jsx). Тот же приём, что у модулей в useFeedModules
  const prevVisible = useRef(visible)
  useEffect(() => {
    if (visible && !prevVisible.current) load()
    prevVisible.current = visible
  }, [visible, load])

  // До первого ответа — зеркало; после него только настоящий список, иначе
  // удалённая на другом устройстве закладка висела бы вечно
  return loaded ? list : readCachedBookmarks(user?.id)
}
