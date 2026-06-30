import { useState } from 'react'

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
    const next = [c, ...curricula]
    setCurricula(next)
    persist(next)
    return c
  }

  function deleteCurriculum(id) {
    const next = curricula.filter(c => c.id !== id)
    setCurricula(next)
    persist(next)
    localStorage.removeItem(`curr_lessons_${id}`)
    localStorage.removeItem(`curr_map_${id}`)
  }

  function renameCurriculum(id, title) {
    const next = curricula.map(c => c.id === id ? { ...c, title } : c)
    setCurricula(next)
    persist(next)
  }

  return { curricula, createCurriculum, deleteCurriculum, renameCurriculum }
}
