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

// Сброс СВОЕГО прохождения уроков (тест-кнопки админа): сервер снимает флаг
// «пройден» и отнимает начисленный XP; clearAnswers=true стирает и лог анализа.
// Возвращает { refunded, error } — ошибку показываем админу, не глотаем
// (типовой случай: RPC ещё не применён в Supabase).
export async function resetLessonProgress(lessonIds, clearAnswers = false) {
  if (!lessonIds?.length) return { refunded: 0, error: null }

  const { data, error } = await supabase.rpc('reset_lesson_progress', {
    p_lesson_ids: lessonIds,
    p_clear_answers: clearAnswers,
  })
  if (error) {
    console.error('[XP] reset_lesson_progress RPC error:', error.message)
    return { refunded: 0, error: error.message }
  }
  return { refunded: data ?? 0, error: null }
}
