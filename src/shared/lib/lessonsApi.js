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
  // .select() обязателен: без него UPDATE, которому RLS тихо не дала совпасть
  // ни с одной строкой (это не ошибка PostgREST, а нормальный «0 строк»),
  // выглядел бы как успех — клиент решил бы, что сохранил, хотя на сервере
  // ничего не изменилось
  const { data, error } = await supabase
    .from('lessons')
    .update({ script })
    .eq('id', id)
    .select('id')
  if (error) { dbg('[DB ERROR] lesson saveScript', error.message); throw error }
  if (!data?.length) {
    dbg('[DB WARN] lesson saveScript matched 0 rows — RLS blocked or wrong id', id)
    throw new Error('Сохранение не применилось: сервер не подтвердил запись (0 строк изменено)')
  }
  dbg('[DB OK] lesson script saved', id)
}

export async function saveLesson(id, { title, script }) {
  const nodeCount = script?.nodes?.length ?? 0
  // Подробный снимок того, что реально уходит на сервер — file_id/r2Url по
  // каждой ноде с медиа, чтобы ловить именно расхождения файлов при сохранении
  const fileSummary = (script?.nodes ?? [])
    .filter(n => n.typeData?.[n.type]?.file_id)
    .map(n => `${n.type}#${n.seq}:${(n.typeData[n.type].file_id ?? '').slice(0, 8)}→${n.typeData[n.type].r2Url ? 'r2Url✓' : 'r2Url✗НЕТ'}`)
    .join(', ')
  dbg('[DB WRITE] lesson save', id, `"${title}"`, nodeCount, 'nodes')
  if (fileSummary) dbg('[DB WRITE] lesson save files:', fileSummary)
  const { data, error } = await supabase
    .from('lessons')
    .update({ title, script })
    .eq('id', id)
    .select('id')
  if (error) { dbg('[DB ERROR] lesson save', error.message); throw error }
  if (!data?.length) {
    dbg('[DB WARN] lesson save matched 0 rows — RLS blocked or wrong id', id)
    throw new Error('Сохранение не применилось: сервер не подтвердил запись (0 строк изменено)')
  }
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
