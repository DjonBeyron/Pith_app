import { supabase } from './supabase.js'

// CRUD шаблонов push-уведомлений (таблица push_templates, RLS: только админ).
// Триггеры: manual — ручная отправка; new_module — при публикации модуля;
// inactive_today / streak_risk / streak_milestone_eve — вечерний cron
// (~19:00 по локальному часовому поясу пользователя); energy_full —
// ежечасный cron; level_up — клиент при пересечении уровня (пуш самому себе
// через push-trigger). В level_up доступен плейсхолдер {level}; в
// streak_risk доступен {streak}; в streak_milestone_eve доступны
// {streak} {day} {xp} {tickets}.

export const TRIGGERS = [
  { value: 'manual', label: 'вручную' },
  { value: 'new_module', label: 'публикация модуля' },
  { value: 'inactive_today', label: 'сегодня не занимался (вечер, ~19:00 по местному времени)' },
  { value: 'streak_risk', label: 'серия под угрозой (вечер, ~19:00 по местному времени)' },
  { value: 'streak_milestone_eve', label: 'завтра веха серии (вечер, по местному времени)' },
  { value: 'energy_full', label: 'энергия восстановилась (каждый час)' },
  { value: 'level_up', label: 'достиг нового уровня' },
]

export async function listTemplates() {
  const { data, error } = await supabase
    .from('push_templates').select('*').order('created_at')
  if (error) throw new Error(error.message)
  return data
}

export async function createTemplate() {
  const { data, error } = await supabase
    .from('push_templates')
    .insert({ name: 'Новый шаблон', title: 'Pithy', body: '' })
    .select().single()
  if (error) throw new Error(error.message)
  return data
}

export async function updateTemplate(id, patch) {
  const { error } = await supabase.from('push_templates').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteTemplate(id) {
  const { error } = await supabase.from('push_templates').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// Включённый шаблон по триггеру (для событий вроде публикации модуля)
export async function findEnabledTemplate(triggerKind) {
  const { data, error } = await supabase
    .from('push_templates').select('*')
    .eq('trigger_kind', triggerKind).eq('enabled', true).limit(1)
  if (error) return null
  return data?.[0] ?? null
}
