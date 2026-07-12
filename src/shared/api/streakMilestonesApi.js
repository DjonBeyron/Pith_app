import { supabase } from './supabase.js'
import { dbg } from '../lib/debug.js'

// CRUD вех наград стрика (админ, вкладка «Стрик»). Чтение открыто всем
// (RLS streak_milestones_select_all), запись — только is_admin
// (streak_milestones_write_admin) — обычный пользователь не изменит
// награды, даже обойдя интерфейс прямым запросом.
export async function fetchStreakMilestonesAdmin() {
  const { data, error } = await supabase
    .from('streak_milestones')
    .select('day_number, xp_reward, ticket_reward, special, label')
    .order('day_number', { ascending: true })
  if (error) { dbg('[STREAK ADMIN] fetch error', error.message); return [] }
  return data ?? []
}

export async function saveStreakMilestone(row) {
  dbg('[STREAK ADMIN] upsert', row)
  const { error } = await supabase.from('streak_milestones').upsert(row)
  if (error) { dbg('[STREAK ADMIN] upsert error', error.message); throw error }
}

export async function deleteStreakMilestone(dayNumber) {
  dbg('[STREAK ADMIN] delete', dayNumber)
  const { error } = await supabase.from('streak_milestones').delete().eq('day_number', dayNumber)
  if (error) { dbg('[STREAK ADMIN] delete error', error.message); throw error }
}
