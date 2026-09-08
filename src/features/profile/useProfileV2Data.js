import { useState, useEffect, useRef, useCallback } from 'react'
import { getCachedProfile, refreshProfile, subscribeProfile } from '../../shared/api/profileCache.js'
import { loadCurricula } from '../../shared/lib/curriculaApi.js'
import { fetchFeedSocial } from '../../shared/api/moduleSocialApi.js'
import { getCompletedLessons } from '../../shared/lib/completedLessons.js'
import { listLessonBookmarks } from '../../shared/lib/lessonBookmarksApi.js'
import { fetchLessonTitles } from '../../shared/lib/lessonsApi.js'
import { supabase } from '../../shared/api/supabase.js'

// Данные профиля (ui v2): XP/энергия из кэша профиля, модули с процентом
// прохождения, закладки (модулей и отдельных уроков — savedLessons), копилка
// слов (названия пройденных уроков между Стартом и Финалом каждого модуля),
// пройденные уроки (вкладка «Пройденные → Уроки» — все когда-либо
// завершённые уроки, кроме диагностики/финала каждого модуля — они игровые
// и не несут ценности как «пройденный урок»).
export function useProfileV2Data() {
  const [profile,      setProfile]      = useState(getCachedProfile)
  const [modules,      setModules]      = useState([])
  const [bookmarks,    setBookmarks]    = useState(new Set())
  const [savedLessons, setSavedLessons] = useState([])
  const [words,        setWords]        = useState([])
  const [doneLessons,  setDoneLessons]  = useState([])
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

      // Закладки на отдельные уроки (lesson_ref «В закладки») — отдельная
      // таблица от module_bookmarks, поэтому свой запрос
      const savedLessonIds = [...await listLessonBookmarks()]
      if (savedLessonIds.length) {
        const titles = await fetchLessonTitles(savedLessonIds)
        if (!cancelled()) {
          setSavedLessons(savedLessonIds.map(id => ({ id, title: titles[id] ?? 'Урок' })))
        }
      } else {
        setSavedLessons([])
      }

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

      // «Пройденные → Уроки»: ЛЮБОЙ когда-либо завершённый урок (модульный
      // или сам по себе, через закладку lesson_ref), кроме Старта/Финала
      // каждого модуля — те игровые, не «урок, который прошёл». Модуль, к
      // которому принадлежит урок, — тот же map, что и выше, для любого
      // урока модуля (не только середины) — Старт/Финал сюда просто не
      // попадут, они уже отфильтрованы отдельным Set.
      const moduleByLesson = {}
      mods.forEach(m => m.lessonIds.forEach(id => { moduleByLesson[id] = m.title }))
      const excludeIds = new Set()
      mods.forEach(m => {
        if (m.lessonIds.length > 1) {
          excludeIds.add(m.lessonIds[0])
          excludeIds.add(m.lessonIds[m.lessonIds.length - 1])
        }
      })
      const doneIds = [...completed].filter(id => !excludeIds.has(id))
      if (doneIds.length) {
        const titles = await fetchLessonTitles(doneIds)
        if (!cancelled()) {
          setDoneLessons(doneIds.map(id => ({
            id, title: titles[id] ?? '…', moduleTitle: moduleByLesson[id] ?? null,
          })))
        }
      } else {
        setDoneLessons([])
      }
    } finally {
      if (!cancelled()) setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { profile, modules, bookmarks, savedLessons, words, doneLessons, loading, reload: load }
}
