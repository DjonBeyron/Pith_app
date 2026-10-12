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

// Поля окна правил (миграция 20261011110000_lesson_rules_fields.sql). Если миграция ещё не применена, запрос с ними падает —
// тогда читаем старый набор колонок, чтобы легенда экспорта и редактор продолжали работать
const BASE_COLS = 'id, rule_text, sort_order, active, category'
const FULL_COLS = `${BASE_COLS}, title, rule_group, checker, severity, bad_example, good_example`

const toEntry = row => ({
  id: row.id,
  text: row.rule_text,
  order: row.sort_order,
  active: row.active,
  category: row.category,
  title: row.title ?? '',
  group: row.rule_group ?? '',
  checker: row.checker ?? 'manual',
  severity: row.severity ?? 'warn',
  bad: row.bad_example ?? '',
  good: row.good_example ?? '',
})

// Какие поля правила пишутся в какие колонки (для patchLessonRule)
const PATCH_COLS = { text: 'rule_text', title: 'title', group: 'rule_group', checker: 'checker', severity: 'severity', bad: 'bad_example', good: 'good_example' }

export async function listLessonRules() {
  const q = cols => supabase.from('lesson_rules').select(cols).order('sort_order', { ascending: true })
  let { data, error } = await q(FULL_COLS)
  if (error) ({ data, error } = await q(BASE_COLS)) // миграция полей ещё не применена
  if (error) throw error
  return (data ?? []).map(toEntry)
}

export async function createLessonRule(text, order, category = 'principle') {
  const { data, error } = await supabase
    .from('lesson_rules')
    .insert({ rule_text: text, sort_order: order, category })
    .select(BASE_COLS)
    .single()
  if (error) throw error
  return toEntry(data)
}

/** Создать правило сразу со всеми полями структуры (стандартный набор): rule = { text, category, title, group, checker, severity, bad, good } */
export async function createLessonRuleFull(rule, order) {
  const { error } = await supabase.from('lesson_rules').insert({
    rule_text: rule.text, sort_order: order, category: rule.category,
    title: rule.title || null, rule_group: rule.group || null, checker: rule.checker, severity: rule.severity,
    bad_example: rule.bad || null, good_example: rule.good || null,
  })
  if (error) throw error
}

export async function updateLessonRule(id, text) {
  const { error } = await supabase
    .from('lesson_rules')
    .update({ rule_text: text, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/** Изменить несколько полей правила разом: { text, title, group, checker, severity, bad, good } (только переданные) */
export async function patchLessonRule(id, patch) {
  const row = { updated_at: new Date().toISOString() }
  for (const [k, v] of Object.entries(patch)) if (PATCH_COLS[k]) row[PATCH_COLS[k]] = v
  const { error } = await supabase.from('lesson_rules').update(row).eq('id', id)
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
