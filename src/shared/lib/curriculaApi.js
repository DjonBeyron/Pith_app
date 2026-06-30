import { supabase } from '../api/supabase.js'
import { dbg } from './debug.js'

export async function saveCurriculum(id, title, lessonIds) {
  dbg('[DB WRITE] curricula upsert', { id, title, lessonIds })
  const { error } = await supabase
    .from('curricula')
    .upsert({ id, title, lesson_ids: lessonIds })
  if (error) {
    dbg('[DB ERROR] curricula upsert', error.message)
    throw error
  }
  dbg('[DB OK] curricula saved', id)
}

export async function deleteCurriculumFromServer(id) {
  dbg('[DB DELETE] curricula', id)
  const { error } = await supabase
    .from('curricula')
    .delete()
    .eq('id', id)
  if (error) {
    dbg('[DB ERROR] curricula delete', error.message)
    throw error
  }
  dbg('[DB OK] curricula deleted', id)
}

export async function loadCurricula() {
  dbg('[DB READ] curricula list')
  const { data, error } = await supabase
    .from('curricula')
    .select('id, title, lesson_ids, created_at')
    .order('created_at', { ascending: false })
  if (error) {
    dbg('[DB ERROR] curricula load', error.message)
    throw error
  }
  dbg('[DB OK] curricula loaded', data?.length, 'rows')
  return data ?? []
}
