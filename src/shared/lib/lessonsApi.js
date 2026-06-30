import { supabase } from '../api/supabase.js'
import { dbg } from './debug.js'

export async function listLessons() {
  const { data, error } = await supabase
    .from('lessons')
    .select('id, title, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createLesson(title) {
  const id = crypto.randomUUID()
  dbg('[DB WRITE] lesson create', id, title)
  const { data, error } = await supabase
    .from('lessons')
    .insert({ id, title, script: { nodes: [] } })
    .select('id, title, created_at')
    .single()
  if (error) { dbg('[DB ERROR] lesson create', error.message); throw error }
  dbg('[DB OK] lesson created', id)
  return data
}

export async function deleteLesson(id) {
  dbg('[DB DELETE] lesson', id)
  const { error } = await supabase
    .from('lessons')
    .delete()
    .eq('id', id)
  if (error) { dbg('[DB ERROR] lesson delete', error.message); throw error }
  dbg('[DB OK] lesson deleted', id)
}

export async function saveScript(id, script) {
  const nodeCount = script?.nodes?.length ?? 0
  dbg('[DB WRITE] lesson script', id, nodeCount, 'nodes')
  const { error } = await supabase
    .from('lessons')
    .update({ script })
    .eq('id', id)
  if (error) { dbg('[DB ERROR] lesson saveScript', error.message); throw error }
  dbg('[DB OK] lesson script saved', id)
}

export async function saveLesson(id, { title, script }) {
  const nodeCount = script?.nodes?.length ?? 0
  dbg('[DB WRITE] lesson save', id, `"${title}"`, nodeCount, 'nodes')
  const { error } = await supabase
    .from('lessons')
    .update({ title, script })
    .eq('id', id)
  if (error) { dbg('[DB ERROR] lesson save', error.message); throw error }
  dbg('[DB OK] lesson saved', id)
}

export async function loadScript(id) {
  dbg('[DB READ] lesson script', id)
  const { data, error } = await supabase
    .from('lessons')
    .select('script, title')
    .eq('id', id)
    .single()
  if (error) { dbg('[DB ERROR] lesson loadScript', error.message); throw error }
  dbg('[DB OK] lesson loaded', id, data?.script?.nodes?.length ?? 0, 'nodes')
  return data
}
