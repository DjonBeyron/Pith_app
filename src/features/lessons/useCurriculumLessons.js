import { useState, useEffect, useRef, useCallback } from 'react'
import { createLesson, deleteLesson } from '../../shared/lib/lessonsApi.js'
import { supabase } from '../../shared/api/supabase.js'

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
    } catch {
      setError('Не удалось переименовать')
    }
  }

  async function removeLesson(id) {
    setError('')
    try {
      await deleteLesson(id)
      const next = idsRef.current.filter(lid => lid !== id)
      setLessonIds(next)
      persistIds(curriculumId, next)
      setLessons(prev => prev.filter(l => l.id !== id))
    } catch {
      setError('Не удалось удалить урок')
    }
  }

  return { lessons, loading, creating, error, bulkCreate, addBeforeFinal, renameLesson, removeLesson }
}
