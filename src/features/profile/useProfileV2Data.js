import { useState, useEffect, useRef, useCallback } from 'react'
import { getCachedProfile, refreshProfile, subscribeProfile } from '../../shared/api/profileCache.js'
import { loadCurricula } from '../../shared/lib/curriculaApi.js'
import { fetchFeedSocial } from '../../shared/api/moduleSocialApi.js'
import { getCompletedLessons } from '../../shared/lib/completedLessons.js'

// Данные профиля (ui v2): XP/энергия из кэша профиля, модули с числом
// пройденных уроков (для «Сохранённых» — только не начатые) и закладки
// модулей. Копилка слов и «Пройденные» убраны (этап 5 системы повторения):
// память слов — карта «Моего обучения», начатое — «Мои уроки».
export function useProfileV2Data() {
  const [profile,      setProfile]      = useState(getCachedProfile)
  const [modules,      setModules]      = useState([])
  const [bookmarks,    setBookmarks]    = useState(new Set())
  const [loading,      setLoading]      = useState(true)

  useEffect(() => {
    const unsubscribe = subscribeProfile(setProfile)
    refreshProfile()
    return unsubscribe
  }, [])

  // Флаг «компонент жив» обязан взводиться заново при каждом монтировании:
  // StrictMode монтирует → размонтирует → монтирует снова, и без сброса
  // cancelled() навсегда true — вкладки профиля зависали на «Загрузка...»
  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false }
  }, [])

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
    } finally {
      if (!cancelled()) setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { profile, modules, bookmarks, loading, reload: load }
}
