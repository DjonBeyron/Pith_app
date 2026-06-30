import { useState } from 'react'
import { saveCurriculum, deleteCurriculumFromServer } from '../../shared/lib/curriculaApi.js'
import { dbg } from '../../shared/lib/debug.js'

const LS_KEY = 'curricula_v1'

function load() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') } catch { return [] }
}

function persist(arr) {
  localStorage.setItem(LS_KEY, JSON.stringify(arr))
}

export function useCurricula() {
  const [curricula, setCurricula] = useState(load)

  function createCurriculum(title = 'Новый модуль') {
    const c = { id: crypto.randomUUID(), title, createdAt: new Date().toISOString() }
    dbg('[LOCAL] curriculum created', c.id, c.title)
    const next = [c, ...curricula]
    setCurricula(next)
    persist(next)
    return c
  }

  async function deleteCurriculum(id) {
    const next = curricula.filter(c => c.id !== id)
    setCurricula(next)
    persist(next)
    localStorage.removeItem(`curr_lessons_${id}`)
    localStorage.removeItem(`curr_map_${id}`)
    try {
      await deleteCurriculumFromServer(id)
    } catch (e) {
      dbg('[DELETE ERROR] curriculum from server', e.message)
    }
  }

  function renameCurriculum(id, title) {
    const next = curricula.map(c => c.id === id ? { ...c, title } : c)
    setCurricula(next)
    persist(next)
    dbg('[LOCAL] curriculum renamed', id, title)
  }

  // Save a single curriculum with its lesson list to Supabase
  async function saveCurriculumToServer(id, title, lessonIds) {
    try {
      await saveCurriculum(id, title, lessonIds)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  return { curricula, createCurriculum, deleteCurriculum, renameCurriculum, saveCurriculumToServer }
}
