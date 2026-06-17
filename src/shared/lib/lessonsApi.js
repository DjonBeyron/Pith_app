import { supabase } from '../api/supabase.js'

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
  const { data, error } = await supabase
    .from('lessons')
    .insert({ id, title, script: { nodes: [] } })
    .select('id, title, created_at')
    .single()
  if (error) throw error
  return data
}

export async function deleteLesson(id) {
  const { error } = await supabase
    .from('lessons')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function saveScript(id, script) {
  const { error } = await supabase
    .from('lessons')
    .update({ script })
    .eq('id', id)
  if (error) throw error
}

export async function loadScript(id) {
  const { data, error } = await supabase
    .from('lessons')
    .select('script, title')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}
