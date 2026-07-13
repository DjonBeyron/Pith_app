import { useEffect, useState } from 'react'
import { fetchFeedSocial, setLike, setBookmark, fetchStartedModules } from '../../shared/api/moduleSocialApi.js'
import { fetchMyDifficultyVotes, setDifficultyVote } from '../../shared/api/difficultyApi.js'
import { fdbg } from '../../shared/lib/feedDebug.js'

// Соц-данные ленты: лайки/закладки/сложность/начатые модули + обработчики
// тапа (гостю — форма входа, юзеру — оптимистичное переключение + сервер)
export function useFeedSocial({ visible, view, user, authLoading, onRequireAuth }) {
  // Лайки/закладки по id модуля — общие для всех копий слайда в круге
  const [reactions, setReactions] = useState({})
  // Мои голоса сложности фразы: { moduleId: 1|2|3 } (перезаписываемые)
  const [diffVotes, setDiffVotes] = useState({})
  // Начатые модули: в «Рекомендациях» их не показываем (они в «Моих уроках»)
  const [startedIds, setStartedIds] = useState(() => new Set())
  // Серверная соц-инфа: залогинен ли, счётчики лайков
  const [social, setSocial] = useState(null)

  function refreshStarted() {
    fetchStartedModules().then(setStartedIds).catch(() => {})
  }
  useEffect(refreshStarted, [])

  // Трекер переключения вкладок (+ обновление «начатых» при открытии «Мои
  // уроки», чтобы только что начатый модуль там появился сразу). Пишем в лог DBG
  useEffect(() => {
    fdbg(`tab: visible=${visible} view=${view} → tabVisible(feed)=${visible && view === 'feed'}`)
    if (visible && view === 'mine') refreshStarted()
  }, [visible, view])

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

  useEffect(() => {
    let cancelled = false
    fetchMyDifficultyVotes()
      .then(v => { if (!cancelled) setDiffVotes(v) })
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

  // Голос сложности: гостю — форма входа; юзеру — оптимистично + сервер.
  // Общий итог (медиану) пересчитает триггер БД — иконка обновится при
  // следующей загрузке ленты, свой голос виден сразу. Возвращает true,
  // если голос учтён — бейдж играет морфинг-подтверждение (галочку).
  function voteDifficulty(id, v) {
    if (authLoading) return false
    if (!user) { onRequireAuth?.(); return false }
    setDiffVotes(d => ({ ...d, [id]: v }))
    setDifficultyVote(id, v)
    return true
  }

  return { reactions, diffVotes, startedIds, social, refreshStarted, toggle, voteDifficulty }
}
