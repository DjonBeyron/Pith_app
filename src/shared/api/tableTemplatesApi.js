import { supabase } from './supabase.js'

// Шаблоны таблиц конструктора — общие для всех уроков и всех админов
// (таблица table_templates, миграция 20260825120000_table_templates.sql).
// Наружу отдаём {id, name, table}: в БД колонка называется data, потому что
// table — зарезервированное слово SQL.

const toEntry = row => ({ id: row.id, name: row.name, table: row.data })

export async function listTableTemplates() {
  const { data, error } = await supabase
    .from('table_templates')
    .select('id, name, data')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(toEntry)
}

// table сохраняется целиком, как есть: вместе с объединениями, размерами
// текста, заголовками и особыми значениями ячеек (options)
export async function createTableTemplate(name, table) {
  const { data, error } = await supabase
    .from('table_templates')
    .insert({ name, data: table })
    .select('id, name, data')
    .single()
  if (error) throw error
  return toEntry(data)
}

export async function renameTableTemplate(id, name) {
  const { error } = await supabase
    .from('table_templates')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteTableTemplate(id) {
  const { error } = await supabase.from('table_templates').delete().eq('id', id)
  if (error) throw error
}
