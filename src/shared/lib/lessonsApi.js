import { supabase } from '../api/supabase.js'
import { pLog } from './debug.js'

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

export async function saveLesson(id, { title, script }) {
  const textNodes = script?.nodes?.filter(n => n.type === 'text') ?? []
  const hlSummary = textNodes.map(n => ({
    seq: n.seq, hlCount: n.typeData?.text?.highlights?.length ?? 0,
    highlights: n.typeData?.text?.highlights ?? [],
  }))
  pLog('[lessonsApi] saveLesson id=', id, 'textNodes=', hlSummary)
  const { error } = await supabase
    .from('lessons')
    .update({ title, script })
    .eq('id', id)
  if (error) { pLog('[lessonsApi] save ERROR:', error.message); throw error }
  pLog('[lessonsApi] save OK')
}

export async function loadScript(id) {
  const { data, error } = await supabase
    .from('lessons')
    .select('script, title')
    .eq('id', id)
    .single()
  if (error) { pLog('[lessonsApi] loadScript ERROR:', error.message); throw error }
  const textNodes = data?.script?.nodes?.filter(n => n.type === 'text') ?? []
  pLog('[lessonsApi] loadScript id=', id, 'textNodes with HL:',
    textNodes.filter(n => n.typeData?.text?.highlights?.length).map(n => ({ seq: n.seq, hl: n.typeData.text.highlights }))
  )
  return data
}
