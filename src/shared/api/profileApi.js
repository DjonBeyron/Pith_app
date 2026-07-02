import { supabase } from './supabase.js'

export async function getProfile() {
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return null

  const { data, error } = await supabase
    .from('user_profiles')
    .select('xp, energy, has_subscription, is_admin')
    .eq('id', user.id)
    .single()

  if (error) return null
  return data
}

// Начисляет XP за урок через серверный RPC. Клиент передаёт только id урока —
// сумму награды считает сервер по своей копии урока, ровно один раз (повтор → 0).
// Возвращает фактически начисленный XP.
export async function completeLesson(lessonId) {
  if (!lessonId) return 0

  const { data, error } = await supabase.rpc('complete_lesson', { p_lesson_id: lessonId })
  if (error) { console.error('[XP] complete_lesson RPC error:', error.message); return 0 }
  return data ?? 0
}
