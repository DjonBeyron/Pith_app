import { supabase } from './supabase.js'

export async function getProfile() {
  // Локальная сессия вместо сетевого getUser — надёжнее на медленном старте
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) return null

  const { data, error } = await supabase
    .from('user_profiles')
    .select('xp, energy, energy_updated_at, tickets, has_subscription, subscription_until, is_admin, nickname, cosmetics, avatar_seed, current_streak, longest_streak, last_claimed_streak_day, has_freeze_charge, auto_freeze_charges_left')
    .eq('id', user.id)
    .single()

  if (error) return null
  return data
}

// Смена аватара на один из пака DiceBear (см. shared/lib/avatarPack.js) —
// menять можно сколько угодно раз, без лимитов (в отличие от ника).
// seed=null — сброс на дефолтную букву-аватар. Возвращает применённый seed.
export async function saveAvatar(seed) {
  const { data, error } = await supabase.rpc('set_avatar', { p_seed: seed })
  if (error) { console.error('[AVATAR] set_avatar:', error.message); return null }
  return data
}

// Старт урока: сервер сам решает, бесплатный он (гость/подписка/админ/
// пересдача/Старт/Финал) или списать энергию. Возвращает jsonb
// { ok, energy?, reason: 'no_energy', next_at? }. Если RPC ещё не применён
// в Supabase — не блокируем прохождение (ok: true).
export async function startLesson(lessonId) {
  const { data, error } = await supabase.rpc('start_lesson', { p_lesson_id: lessonId })
  if (error) {
    console.error('[ENERGY] start_lesson RPC error:', error.message)
    return { ok: true }
  }
  return data ?? { ok: true }
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
