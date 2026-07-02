import { useState, useEffect, useRef, useCallback } from 'react'
import { createLesson, deleteLesson } from '../../shared/lib/lessonsApi.js'
import { saveCurriculum, loadCurricula } from '../../shared/lib/curriculaApi.js'
import { supabase } from '../../shared/api/supabase.js'
import { dbg } from '../../shared/lib/debug.js'

// Module-level lock: prevents double bulkCreate in React StrictMode (mount→unmount→mount)
const bulkCreateInProgress = new Set()

const lsKey = id => `curr_lessons_${id}`

function loadIds(curriculumId) {
  try {
    const raw = localStorage.getItem(lsKey(curriculumId)) ?? '[]'
    const ids = JSON.parse(raw)
    dbg('[LS READ] lesson_ids for', curriculumId, '→', ids.length, 'ids:', ids)
    return ids
  } catch { return [] }
}

function persistIds(curriculumId, ids) {
  localStorage.setItem(lsKey(curriculumId), JSON.stringify(ids))
  dbg('[LS WRITE] lesson_ids for', curriculumId, '→', ids.length, 'ids')
}

export function useCurriculumLessons(curriculumId, curriculumTitle) {
  const [lessonIds, setLessonIds] = useState(() => loadIds(curriculumId))
  const [lessons,   setLessons]   = useState([])
  const [loading,   setLoading]   = useState(false)
  const [creating,  setCreating]  = useState(false)
  const [error,     setError]     = useState('')
  const [isDirty,   setIsDirty]   = useState(false)
  const idsRef   = useRef(lessonIds)
  const titleRef = useRef(curriculumTitle)

  useEffect(() => { idsRef.current   = lessonIds      }, [lessonIds])
  useEffect(() => { titleRef.current = curriculumTitle }, [curriculumTitle])

  const fetchLessons = useCallback(async (ids) => {
    if (!ids.length) { setLessons([]); return }
    dbg('[FETCH] loading', ids.length, 'lessons from DB:', ids)
    setLoading(true)
    const { data, error: e } = await supabase.from('lessons')
      .select('id, title, created_at, published, script')
      .in('id', ids)
    setLoading(false)
    if (e) { dbg('[FETCH ERROR]', e.message); setError('Ошибка загрузки'); return }
    dbg('[FETCH OK]', data?.length, 'lessons returned from DB')
    const byId = Object.fromEntries((data ?? []).map(l => [l.id, l]))
    const ordered = ids.map(id => byId[id]).filter(Boolean).map(l => ({
      ...l,
      lessonXp:  l.script?.lessonXp  ?? 0,
      priority:  l.script?.priority  ?? null,
      xp_unlock: l.script?.xp_unlock ?? 0,
    }))
    dbg('[FETCH] ordered result:', ordered.map(l => `${l.id.slice(0,6)} "${l.title}"`))
    setLessons(ordered)
  }, [])

  useEffect(() => { fetchLessons(lessonIds) }, [lessonIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  async function togglePublished(id, currentValue) {
    const next = !currentValue
    dbg('[DB WRITE] lesson published', id, '→', next)
    const { error: e } = await supabase.from('lessons').update({ published: next }).eq('id', id)
    if (e) { dbg('[DB ERROR] togglePublished', e.message); return }
    dbg('[DB OK] lesson published updated', id, next)
    setLessons(prev => prev.map(l => l.id === id ? { ...l, published: next } : l))
  }

  async function bulkCreate(titles) {
    if (bulkCreateInProgress.has(curriculumId)) {
      dbg('[bulkCreate] SKIP — already in progress for', curriculumId)
      return
    }
    bulkCreateInProgress.add(curriculumId)
    // Check server first — prevent creating duplicates if lesson_ids already exist on server
    dbg('[bulkCreate] START — checking server for existing lesson_ids...')
    try {
      const rows = await loadCurricula()
      dbg('[bulkCreate] server curricula count:', rows.length)
      const curr = rows.find(r => r.id === curriculumId)
      dbg('[bulkCreate] found curriculum on server:', !!curr, 'lesson_ids:', curr?.lesson_ids)
      const serverIds = curr?.lesson_ids ?? []
      if (serverIds.length) {
        dbg('[bulkCreate] ABORT — server already has', serverIds.length, 'lessons, restoring...')
        setLessonIds(serverIds)
        persistIds(curriculumId, serverIds)
        await fetchLessons(serverIds)
        return
      }
      dbg('[bulkCreate] server has no lessons — will create:', titles)
    } catch (e) {
      dbg('[bulkCreate] server check FAILED:', e.message, '— proceeding with local create')
    }

    setCreating(true)
    setError('')
    try {
      const created = []
      for (const title of titles) {
        dbg('[bulkCreate] creating lesson:', title)
        const lesson = await createLesson(title)
        if (lesson) { created.push(lesson); dbg('[bulkCreate] created:', lesson.id, lesson.title) }
      }
      if (created.length) {
        const ids = created.map(l => l.id)
        setLessonIds(ids)
        persistIds(curriculumId, ids)
        setLessons(created)
        setIsDirty(true)
        dbg('[bulkCreate] DONE — created', created.length, 'lessons, isDirty=true (press 💾 to save structure)')
      }
    } catch (e) {
      dbg('[bulkCreate ERROR]', e.message)
      setError('Не удалось создать уроки')
    } finally {
      setCreating(false)
      bulkCreateInProgress.delete(curriculumId)
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
      dbg('[addBeforeFinal] added lesson', lesson.id, '— isDirty=true (press 💾 to save structure)')
    } catch (e) {
      dbg('[addBeforeFinal ERROR]', e.message)
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
    } catch (e) {
      dbg('[renameLesson ERROR]', e.message)
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
      dbg('[DB OK] lesson deleted', id, '— isDirty=true (press 💾 to save structure)')
    } catch (e) {
      dbg('[removeLesson ERROR]', e.message)
      setError('Не удалось удалить урок')
    }
  }

  // Manual save only — triggered by 💾 button
  async function saveStructure() {
    const ids = idsRef.current
    const title = titleRef.current ?? ''
    dbg('[SAVE] manual save — curriculum:', curriculumId, 'title:', title, 'lesson_ids:', ids)
    try {
      await saveCurriculum(curriculumId, title, ids)
      setIsDirty(false)
      dbg('[SAVE OK] structure saved to server')
      return { ok: true }
    } catch (e) {
      dbg('[SAVE ERROR]', e.message)
      return { ok: false, error: e.message }
    }
  }

  return { lessons, loading, creating, error, isDirty, bulkCreate, addBeforeFinal, renameLesson, removeLesson, saveStructure, togglePublished }
}
