import { useState, useEffect } from 'react'
import { fetchFeedSocial, setLike, setBookmark, fetchStartedModules } from '../../shared/api/moduleSocialApi.js'
import { useAuth } from '../../shared/lib/useAuth.js'

// Соц-часть ленты: лайки/закладки (оптимистично + сервер в фоне), серверные
// счётчики и список начатых модулей (их не показываем в «Рекомендациях»).
export function useFeedSocial({ onRequireAuth }) {
  // Лайки/закладки по id модуля — общие для всех копий слайда в круге
  const [reactions, setReactions] = useState({})
  // Начатые модули: в «Рекомендациях» их не показываем (они в «Моих уроках»)
  const [startedIds, setStartedIds] = useState(() => new Set())
  // Серверная соц-инфа: залогинен ли, счётчики лайков
  const [social, setSocial] = useState(null)
  // Авторизация из локальной сессии — мгновенно, не ждём fetchFeedSocial
  // (раньше тап по лайку до его загрузки улетал в форму входа)
  const { user, loading: authLoading } = useAuth()

  function refreshStarted() {
    fetchStartedModules().then(setStartedIds).catch(() => {})
  }
  useEffect(refreshStarted, [])

  useEffect(() => {
    let cancelled = false
    fetchFeedSocial()
      .then(s => {
        if (cancelled) return
        setSocial(s)
        // Мои лайки/закладки с сервера — стартовое состояние иконок
        setReactions(prev => {
          const next = { ...prev }
          for (const id of s.myLikes)     next[id] = { ...next[id], liked: true }
          for (const id of s.myBookmarks) next[id] = { ...next[id], saved: true }
          return next
        })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Лайк/закладка: гостю — форма входа; юзеру — оптимистичное переключение
  // + запись на сервер в фоне
  function toggle(id, key) {
    if (authLoading) return
    if (!user) { onRequireAuth?.(); return }
    const on = !reactions[id]?.[key]
    setReactions(r => ({ ...r, [id]: { ...r[id], [key]: on } }))
    if (key === 'liked') {
      setSocial(s => s && ({
        ...s,
        likeCount: { ...s.likeCount, [id]: Math.max(0, (s.likeCount[id] ?? 0) + (on ? 1 : -1)) },
      }))
      setLike(id, on)
    } else {
      setBookmark(id, on)
    }
  }

  return { reactions, social, startedIds, refreshStarted, toggle }
}
