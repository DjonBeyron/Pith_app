import { useState, useEffect, useRef, useCallback } from 'react'
import { createLesson, deleteLesson } from '../../shared/lib/lessonsApi.js'
import { saveCurriculum } from '../../shared/lib/curriculaApi.js'
import { supabase } from '../../shared/api/supabase.js'
import { dbg } from '../../shared/lib/debug.js'

const lsKey = id => `curr_lessons_${id}`

function loadIds(curriculumId) {
  try { return JSON.parse(localStorage.getItem(lsKey(curriculumId)) ?? '[]') } catch { return [] }
}

function persistIds(curriculumId, ids) {
  localStorage.setItem(lsKey(curriculumId), JSON.stringify(ids))
}

export function useCurriculumLessons(curriculumId) {
  const [lessonIds, setLessonIds] = useState(() => loadIds(curriculumId))
  const [lessons, setLessons]     = useState([])
  const [loading, setLoading]     = useState(false)
  const [creating, setCreating]   = useState(false)
  const [error, setError]         = useState('')
  const [isDirty, setIsDirty]     = useState(false)
  const idsRef = useRef(lessonIds)

  useEffect(() => { idsRef.current = lessonIds }, [lessonIds])

  const fetchLessons = useCallback(async (ids) => {
    if (!ids.length) { setLessons([]); return }
    setLoading(true)
    const { data, error: e } = await supabase.from('lessons')
      .select('id, title, created_at')
      .in('id', ids)
    setLoading(false)
    if (e) { setError('Ошибка загрузки'); return }
    const byId = Object.fromEntries((data ?? []).map(l => [l.id, l]))
    setLessons(ids.map(id => byId[id]).filter(Boolean))
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchLessons(lessonIds) }, [lessonIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  async function bulkCreate(titles) {
    setCreating(true)
    setError('')
    try {
      const created = []
      for (const title of titles) {
        const lesson = await createLesson(title)
        if (lesson) created.push(lesson)
      }
      if (created.length) {
        const ids = created.map(l => l.id)
        setLessonIds(ids)
        persistIds(curriculumId, ids)
        setLessons(created)
        setIsDirty(true)
      }
    } catch {
      setError('Не удалось создать уроки')
    } finally {
      setCreating(false)
    }
  }

  async function addBeforeFinal(title = 'Урок') {
    setCreating(true)
    setError('')
    try {
      const lesson = await createLesson(title)
      if (!lesson) return
      const cur = idsRef.current
      const at  = Math.max(0, cur.length - 1) // insert before last (FINAL)
      const next = [...cur.slice(0, at), lesson.id, ...cur.slice(at)]
      setLessonIds(next)
      persistIds(curriculumId, next)
      setLessons(prev => {
        const arr = [...prev]
        arr.splice(Math.max(0, arr.length - 1), 0, lesson)
        return arr
      })
      setIsDirty(true)
    } catch {
      setError('Не удалось добавить урок')
    } finally {
      setCreating(false)
    }
  }

  async function renameLesson(id, title) {
    setError('')
    try {
      await supabase.from('lessons').update({ title }).eq('id', id)
      setLessons(prev => prev.map(l => l.id === id ? { ...l, title } : l))
      setIsDirty(true)
    } catch {
      setError('Не удалось переименовать')
    }
  }

  async function removeLesson(id) {
    setError('')
    try {
      dbg('[DB DELETE] lesson', id)
      await deleteLesson(id)
      const next = idsRef.current.filter(lid => lid !== id)
      setLessonIds(next)
      persistIds(curriculumId, next)
      setLessons(prev => prev.filter(l => l.id !== id))
      setIsDirty(true)
      dbg('[DB OK] lesson deleted', id)
    } catch {
      setError('Не удалось удалить урок')
    }
  }

  // Saves curriculum structure (module + lesson order) to Supabase
  async function saveStructure(curriculumTitle) {
    try {
      const ids = idsRef.current
      dbg('[SAVE] curriculum structure', curriculumId, 'lessons:', ids)
      await saveCurriculum(curriculumId, curriculumTitle, ids)
      setIsDirty(false)
      return { ok: true }
    } catch (e) {
      dbg('[SAVE ERROR]', e.message)
      return { ok: false, error: e.message }
    }
  }

  return { lessons, loading, creating, error, isDirty, bulkCreate, addBeforeFinal, renameLesson, removeLesson, saveStructure }
}
