import { useState, useEffect, useRef } from 'react'
import { saveCurriculum, deleteCurriculumFromServer, loadCurricula } from '../../shared/lib/curriculaApi.js'
import { supabase } from '../../shared/api/supabase.js'
import { dbg } from '../../shared/lib/debug.js'

const LS_KEY = 'curricula_v1'

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') } catch { return [] }
}

function persist(arr) {
  localStorage.setItem(LS_KEY, JSON.stringify(arr))
}

export function useCurricula() {
  const [curricula,   setCurricula]   = useState(loadLocal)
  const [syncStatus,  setSyncStatus]  = useState('idle') // idle | loading | ok | error
  const [syncError,   setSyncError]   = useState('')
  const fetchedRef = useRef(false) // prevent double-fetch in React StrictMode dev

  // On mount: load from server and merge with local (server is authoritative)
  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    async function fetchFromServer() {
      setSyncStatus('loading')
      dbg('[LOAD] fetching curricula from server...')
      try {
        const rows = await loadCurricula()
        dbg('[LOAD] server returned', rows.length, 'curricula:', rows.map(r => r.title))

        if (rows.length === 0) {
          dbg('[LOAD] server has 0 curricula — keeping local:', loadLocal().length, 'items')
          setSyncStatus('ok')
          return
        }

        // Map server rows to local format
        const fromServer = rows.map(r => ({
          id:         r.id,
          title:      r.title,
          lessonIds:  r.lesson_ids ?? [],
          createdAt:  r.created_at,
        }))

        // Restore lesson_ids to localStorage — critical for fresh devices
        fromServer.forEach(c => {
          const lsKey = `curr_lessons_${c.id}`
          const local = JSON.parse(localStorage.getItem(lsKey) ?? '[]')
          if (c.lessonIds.length && !local.length) {
            localStorage.setItem(lsKey, JSON.stringify(c.lessonIds))
            dbg('[LOAD] restored lesson_ids for curriculum', c.id, '→', c.lessonIds.length, 'lessons')
          }
        })

        // Merge: server rows + any local-only items not yet saved
        const serverIds = new Set(fromServer.map(c => c.id))
        const localOnly = loadLocal().filter(c => !serverIds.has(c.id))
        dbg('[LOAD] local-only (not on server):', localOnly.length)

        const merged = [...fromServer, ...localOnly]
        setCurricula(merged)
        persist(merged)
        dbg('[LOAD] merged total:', merged.length, 'curricula')
        setSyncStatus('ok')
      } catch (e) {
        dbg('[LOAD ERROR] curricula from server:', e.message)
        setSyncError(e.message)
        setSyncStatus('error')
      }
    }
    fetchFromServer()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function createCurriculum(title = 'Новый модуль') {
    const c = { id: crypto.randomUUID(), title, createdAt: new Date().toISOString() }
    dbg('[LOCAL] curriculum created', c.id, c.title)
    const next = [c, ...curricula]
    setCurricula(next)
    persist(next)
    return c
  }

  async function deleteCurriculum(id) {
    // Read lesson_ids before clearing localStorage
    let lessonIds = []
    try { lessonIds = JSON.parse(localStorage.getItem(`curr_lessons_${id}`) ?? '[]') } catch {}

    const next = curricula.filter(c => c.id !== id)
    setCurricula(next)
    persist(next)
    localStorage.removeItem(`curr_lessons_${id}`)
    localStorage.removeItem(`curr_map_${id}`)

    // Delete child lessons from DB
    if (lessonIds.length) {
      dbg('[DELETE] deleting', lessonIds.length, 'lessons for curriculum', id)
      const { error: e } = await supabase.from('lessons').delete().in('id', lessonIds)
      if (e) dbg('[DELETE ERROR] lessons', e.message)
      else dbg('[DELETE OK] lessons deleted', lessonIds.length)
    }

    try {
      await deleteCurriculumFromServer(id)
    } catch (e) {
      dbg('[DELETE ERROR] curriculum from server', e.message)
    }
  }

  async function renameCurriculum(id, title) {
    const next = curricula.map(c => c.id === id ? { ...c, title } : c)
    setCurricula(next)
    persist(next)
    dbg('[LOCAL] curriculum renamed', id, title)
    // Auto-save renamed title to server
    const lessonIds = JSON.parse(localStorage.getItem(`curr_lessons_${id}`) ?? '[]')
    try {
      await saveCurriculum(id, title, lessonIds)
    } catch (e) {
      dbg('[RENAME ERROR] save to server', e.message)
    }
  }

  async function saveCurriculumToServer(id, title, lessonIds) {
    try {
      await saveCurriculum(id, title, lessonIds)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  return { curricula, syncStatus, syncError, createCurriculum, deleteCurriculum, renameCurriculum, saveCurriculumToServer }
}
