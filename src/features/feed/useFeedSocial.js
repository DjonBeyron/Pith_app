import { useEffect, useState } from 'react'
import { fetchFeedSocial, setLike, setBookmark, fetchStartedModules } from '../../shared/api/moduleSocialApi.js'
import { fetchMyDifficultyVotes, setDifficultyVote } from '../../shared/api/difficultyApi.js'
import { reportDifficultyVote } from '../../shared/lib/level/levelFeed.js'
import { fdbg } from '../../shared/lib/feedDebug.js'
import { track } from '../../shared/lib/analytics/track.js'
import { FEED_LIKE, FEED_SAVE } from '../../shared/lib/analytics/eventNames.js'
import { getGuestLikes, getGuestSaves, toggleGuestLike, toggleGuestSave } from '../../shared/lib/guestSocial.js'
import { noteGuestLiked } from './guestSaveHint.js'

// Гостевые лайки/закладки (localStorage, guestSocial.js) как стартовое состояние иконок
function guestReactions() {
  const out = {}
  for (const id of getGuestLikes()) out[id] = { ...out[id], liked: true }
  for (const id of getGuestSaves()) out[id] = { ...out[id], saved: true }
  return out
}

// Соц-данные ленты: лайки/закладки/сложность/начатые модули + обработчики
// тапа (оптимистичное переключение; юзеру — ещё запись на сервер, гостю — в
// localStorage: переедет в аккаунт при входе, importGuestSocial)
export function useFeedSocial({ visible, view, user, authLoading, onRequireAuth }) {
  // Лайки/закладки по id модуля — общие для всех копий слайда в круге
  const [reactions, setReactions] = useState(guestReactions)
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
        // Гостевые лайки ещё не на сервере — счётчик показывает их +1 (как и сразу после тапа)
        if (!s.isAuthed) for (const id of getGuestLikes()) s.likeCount[id] = (s.likeCount[id] ?? 0) + 1
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

  // Лайк/закладка: оптимистичное переключение; юзеру — запись на сервер в
  // фоне, гостю — в localStorage (форму входа не открываем, B7)
  function toggle(id, key) {
    if (authLoading) return
    let on = !reactions[id]?.[key]
    if (!user) {
      on = key === 'liked' ? toggleGuestLike(id) : toggleGuestSave(id)
      if (on) noteGuestLiked()
    }
    track(key === 'liked' ? FEED_LIKE : FEED_SAVE, user ? { module_id: id, on } : { module_id: id, on, guest: true })
    setReactions(r => ({ ...r, [id]: { ...r[id], [key]: on } }))
    if (key === 'liked') {
      setSocial(s => s && ({
        ...s,
        likeCount: { ...s.likeCount, [id]: Math.max(0, (s.likeCount[id] ?? 0) + (on ? 1 : -1)) },
      }))
      if (user) setLike(id, on)
    } else if (user) {
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
    reportDifficultyVote(id, v) // голос — наблюдение для оценки уровня (A2)
    return true
  }

  return { reactions, diffVotes, startedIds, social, refreshStarted, toggle, voteDifficulty }
}
