import { useState, useEffect } from 'react'
import { listLessons, createLesson, deleteLesson } from '../../shared/lib/lessonsApi.js'

export function useLessons({ onOpenCanvas }) {
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      setLessons(await listLessons())
    } catch (e) {
      console.error('[lessons] load failed', e)
      setError('Не удалось загрузить уроки')
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [])

  async function create() {
    setCreating(true)
    setError('')
    try {
      const lesson = await createLesson('Новый урок')
      setLessons(prev => [lesson, ...prev])
      onOpenCanvas(lesson.id)
    } catch (e) {
      console.error('[lessons] create failed', e)
      setError('Не удалось создать урок')
    } finally {
      setCreating(false)
    }
  }

  async function remove(id) {
    setError('')
    try {
      await deleteLesson(id)
      setLessons(prev => prev.filter(l => l.id !== id))
    } catch (e) {
      console.error('[lessons] delete failed', e)
      setError('Не удалось удалить урок')
    }
  }

  return { lessons, loading, creating, error, create, remove }
}
