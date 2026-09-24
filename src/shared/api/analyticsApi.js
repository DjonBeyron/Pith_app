import { supabase } from './supabase.js'

// Отчёт продуктовой аналитики для админки (RPC analytics_report, миграция
// 20260924130000_app_events.sql): воронка, активные по дням, удержание
// D1/D7, уроки, лента. Только админ. { data, error }
export async function fetchAnalyticsReport(days) {
  const { data, error } = await supabase.rpc('analytics_report', { p_days: days })
  return { data: data ?? null, error: error?.message ?? null }
}
