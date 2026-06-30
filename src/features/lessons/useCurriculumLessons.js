import { useState, useEffect, useRef, useCallback } from 'react'
import { createLesson, deleteLesson } from '../../shared/lib/lessonsApi.js'
import { saveCurriculum, loadCurricula } from '../../shared/lib/curriculaApi.js'
import { supabase } from '../../shared/api/supabase.js'
import { dbg } from '../../shared/lib/debug.js'

const lsKey = id => `curr_lessons_${id}`

function loadIds(curriculumId) {
  try { return JSON.parse(localStorage.getItem(lsKey(curriculumId)) ?? '[]') } catch { return [] }
}

function persistIds(curriculumId, ids) {
  localStorage.setItem(lsKey(curriculumId), JSON.stringify(ids))
}

export function useCurriculumLessons(curriculumId, curriculumTitle) {
  const [lessonIds, setLessonIds] = useState(() => loadIds(curriculumId))
  const [lessons,   setLessons]   = useState([])
  const [loading,   setLoading]   = useState(false)
  const [creating,  setCreating]  = useState(false)
  const [error,     setError]     = useState('')
  const [isDirty,   setIsDirty]   = useState(false)
  const idsRef      = useRef(lessonIds)
  const titleRef    = useRef(curriculumTitle)

  useEffect(() => { idsRef.current   = lessonIds      }, [lessonIds])
  useEffect(() => { titleRef.current = curriculumTitle }, [curriculumTitle])

  // Auto-save lesson_ids to server after every structural change
  async function autoSave(ids) {
    try {
      await saveCurriculum(curriculumId, titleRef.current ?? '', ids)
      dbg('[AUTO-SAVE] curriculum structure saved', curriculumId, ids.length, 'lessons')
      setIsDirty(false)
    } catch (e) {
      dbg('[AUTO-SAVE ERROR]', e.message)
    }
  }

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

  useEffect(() => { fetchLessons(lessonIds) }, [lessonIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  async function bulkCreate(titles) {
    // Race condition guard: check server for existing lesson_ids before creating
    dbg('[bulkCreate] checking server before creating...')
    try {
      const rows = await loadCurricula()
      const curr = rows.find(r => r.id === curriculumId)
      const serverIds = curr?.lesson_ids ?? []
      if (serverIds.length) {
        dbg('[bulkCreate] server already has', serverIds.length, 'lessons — restoring instead of creating')
        setLessonIds(serverIds)
        persistIds(curriculumId, serverIds)
        await fetchLessons(serverIds)
        return
      }
    } catch (e) {
      dbg('[bulkCreate] server check failed, proceeding with create:', e.message)
    }

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
        setIsDirty(false)
        await autoSave(ids)
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
      const cur  = idsRef.current
      const at   = Math.max(0, cur.length - 1)
      const next = [...cur.slice(0, at), lesson.id, ...cur.slice(at)]
      setLessonIds(next)
      persistIds(curriculumId, next)
      setLessons(prev => {
        const arr = [...prev]
        arr.splice(Math.max(0, arr.length - 1), 0, lesson)
        return arr
      })
      setIsDirty(true)
      await autoSave(next)
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
      dbg('[DB OK] lesson deleted', id)
      await autoSave(next)
    } catch {
      setError('Не удалось удалить урок')
    }
  }

  async function saveStructure() {
    const ids = idsRef.current
    dbg('[SAVE] curriculum structure', curriculumId, 'lessons:', ids)
    try {
      await saveCurriculum(curriculumId, titleRef.current ?? '', ids)
      setIsDirty(false)
      return { ok: true }
    } catch (e) {
      dbg('[SAVE ERROR]', e.message)
      return { ok: false, error: e.message }
    }
  }

  return { lessons, loading, creating, error, isDirty, bulkCreate, addBeforeFinal, renameLesson, removeLesson, saveStructure }
}
