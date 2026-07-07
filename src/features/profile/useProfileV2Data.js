import { useState, useEffect, useRef, useCallback } from 'react'
import { getCachedProfile, refreshProfile, subscribeProfile } from '../../shared/api/profileCache.js'
import { loadCurricula } from '../../shared/lib/curriculaApi.js'
import { fetchFeedSocial } from '../../shared/api/moduleSocialApi.js'
import { getCompletedLessons } from '../../shared/lib/completedLessons.js'
import { supabase } from '../../shared/api/supabase.js'

// Данные профиля (ui v2): XP/энергия из кэша профиля, модули с процентом
// прохождения, закладки, копилка слов (названия пройденных уроков между
// Стартом и Финалом каждого модуля).
export function useProfileV2Data() {
  const [profile,   setProfile]   = useState(getCachedProfile)
  const [modules,   setModules]   = useState([])
  const [bookmarks, setBookmarks] = useState(new Set())
  const [words,     setWords]     = useState([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    const unsubscribe = subscribeProfile(setProfile)
    refreshProfile()
    return unsubscribe
  }, [])

  const aliveRef = useRef(true)
  useEffect(() => () => { aliveRef.current = false }, [])

  // load() вызывается на маунте и тихо (без флага loading) при каждом
  // возврате на вкладку — пользователь не видит перезагрузку
  const load = useCallback(async () => {
    const cancelled = () => !aliveRef.current
    try {
      const completed = getCompletedLessons()
      const [rows, social] = await Promise.all([loadCurricula(), fetchFeedSocial()])
      if (cancelled()) return

      const mods = rows.map(r => {
        const ids  = r.lesson_ids ?? []
        const done = ids.filter(id => completed.has(id)).length
        return {
          id: r.id, title: r.title, lessonIds: ids,
          total: ids.length, done,
          pct: ids.length ? Math.round((done / ids.length) * 100) : 0,
        }
      })
      setModules(mods)
      setBookmarks(social.myBookmarks)

      // Копилка: пройденные уроки-слова (без Старта и Финала)
      const fromModule = {}
      const wordIds = []
      mods.forEach(m => m.lessonIds.slice(1, -1).forEach(id => {
        if (completed.has(id)) { wordIds.push(id); fromModule[id] = m.title }
      }))
      if (wordIds.length) {
        const { data } = await supabase.from('lessons').select('id, title').in('id', wordIds)
        if (!cancelled()) {
          setWords((data ?? []).map(l => ({ id: l.id, word: l.title, from: fromModule[l.id] })))
        }
      } else {
        setWords([])
      }
    } finally {
      if (!cancelled()) setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { profile, modules, bookmarks, words, loading, reload: load }
}
