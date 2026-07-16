import { useEffect, useState } from 'react'
import { displayDifficulty } from '../../shared/api/difficultyApi.js'

const LS_KEY = 'pithy_feed_diff_filter_v1'
const ALL_LEVELS = [1, 2, 3]

function loadSelected() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]')
    return new Set(raw.filter(v => ALL_LEVELS.includes(v)))
  } catch { return new Set() }
}

// Фильтр сложности фразы (кнопка 🔍 в шапке ленты): чипы 🟢🟡🔴 мультивыбор,
// «все выключены» = «все включены» (нет смысла что-то прятать). Общий для
// «Рекомендаций» и «Моих уроков», запоминается в localStorage. Текстовый
// поиск — эфемерный, живёт в самой панели (FeedSearchPanel), сюда не входит.
export function useFeedFilter() {
  const [selected, setSelected] = useState(loadSelected)

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify([...selected]))
  }, [selected])

  const isAll = selected.size === 0 || selected.size === 3
  const active = !isAll // фильтр реально что-то прячет — кнопка 🔍 должна это показать

  function toggle(level) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(level)) next.delete(level); else next.add(level)
      return next
    })
  }

  function reset() { setSelected(new Set()) }

  // «Рекомендации»: общий итог (без своего голоса). Серые фразы (мало
  // голосов, displayDifficulty вернул null) при активном фильтре всё равно
  // подмешиваются — примерно 1 из 6, детерминированно по позиции модуля в
  // общем списке (overallIdx), а не случайно на каждый рендер
  function passesFeed(mod, overallIdx) {
    if (isAll) return true
    const level = displayDifficulty(mod, null, false)
    if (level === null) return overallIdx % 6 === 0
    return selected.has(level)
  }

  // «Мои уроки»: свой голос в приоритете (иначе общий); серые видны всегда
  function passesMine(mod, myVote) {
    if (isAll) return true
    const level = displayDifficulty(mod, myVote, true)
    if (level === null) return true
    return selected.has(level)
  }

  return { selected, toggle, reset, active, passesFeed, passesMine }
}
