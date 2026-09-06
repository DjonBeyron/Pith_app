import { supabase } from './supabase.js'

// Правила формирования урока (принципы легенды экспорта) — таблица
// lesson_rules, миграции 20260905120000_lesson_rules.sql +
// 20260905130000_lesson_rules_category.sql. Админ правит их в
// LessonRulesPanel.jsx, а buildLegend() (lessonSchema.js) кладёт активный
// список в экспорт урока.
//
// category различает, КОГДА правило проверяется:
//   principle — в момент написания конкретной ноды;
//   checklist — только по готовому черновику, целиком по всему уроку,
//     перед тем как отдать урок (см. PROJECT.md).

const toEntry = row => ({
  id: row.id,
  text: row.rule_text,
  order: row.sort_order,
  active: row.active,
  category: row.category,
})

export async function listLessonRules() {
  const { data, error } = await supabase
    .from('lesson_rules')
    .select('id, rule_text, sort_order, active, category')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []).map(toEntry)
}

export async function createLessonRule(text, order, category = 'principle') {
  const { data, error } = await supabase
    .from('lesson_rules')
    .insert({ rule_text: text, sort_order: order, category })
    .select('id, rule_text, sort_order, active, category')
    .single()
  if (error) throw error
  return toEntry(data)
}

export async function updateLessonRule(id, text) {
  const { error } = await supabase
    .from('lesson_rules')
    .update({ rule_text: text, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function setLessonRuleActive(id, active) {
  const { error } = await supabase
    .from('lesson_rules')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function setLessonRuleCategory(id, category) {
  const { error } = await supabase
    .from('lesson_rules')
    .update({ category, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// Обмен sort_order с соседом — простой способ подвинуть строку вверх/вниз
// без отдельного drag-and-drop. Соседа ищут в пределах ТОЙ ЖЕ категории
// (см. useLessonRules.js) — порядок между принципами и чек-листом не связан.
export async function swapLessonRuleOrder(a, b) {
  const { error: e1 } = await supabase.from('lesson_rules').update({ sort_order: b.order }).eq('id', a.id)
  if (e1) throw e1
  const { error: e2 } = await supabase.from('lesson_rules').update({ sort_order: a.order }).eq('id', b.id)
  if (e2) throw e2
}

export async function deleteLessonRule(id) {
  const { error } = await supabase.from('lesson_rules').delete().eq('id', id)
  if (error) throw error
}
