import { supabase } from './supabase.js'

// Отчёт продуктовой аналитики для админки (RPC analytics_report, миграция
// 20260924130000_app_events.sql): воронка, активные по дням, удержание
// D1/D7, уроки, лента. Только админ. { data, error }
export async function fetchAnalyticsReport(days) {
  const { data, error } = await supabase.rpc('analytics_report', { p_days: days })
  return { data: data ?? null, error: error?.message ?? null }
}

// Разрез по группе «вопросы Пита» (RPC analytics_prompt_groups, миграция 20261027141000_analytics_prompt_groups.sql):
// по группам control / prompts — устройства, возврат на 2-й и 7-й день, показы и закрытия шторок. Только админ. { data, error }
export async function fetchPromptGroups(days) {
  const { data, error } = await supabase.rpc('analytics_prompt_groups', { p_days: days })
  return { data: data ?? null, error: error?.message ?? null }
}
