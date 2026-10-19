import { traceLaunch } from '../lib/launchTrace.js'
import { supabase } from './supabase.js'
import { dbg } from '../lib/debug.js'
import { viewSession } from './viewSession.js'

// real — настоящий профиль, даже в режиме «новенький» (newbieSim.js): так узнаём, админ ли это. Иначе в этом
// режиме профиля «нет», как у гостя
export async function getProfile({ real = false } = {}) {
  // Локальная сессия вместо сетевого getUser — надёжнее на медленном старте
  const session = real ? (await supabase.auth.getSession()).data.session : await viewSession()
  const user = session?.user
  if (!user) return null

  const { data, error } = await supabase
    .from('user_profiles')
    .select('xp, energy, energy_updated_at, tickets, has_subscription, subscription_until, is_admin, nickname, cosmetics, avatar_seed, current_streak, longest_streak, last_claimed_streak_day, has_freeze_charge, auto_freeze_charges_left, slowmo_hint_seen')
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
// Ответ start_lesson ждём не бесконечно: если запрос завис (сеть, блокировка авторизации), урок открывается так же, как при ошибке RPC (ok: true);
// раньше карточка запуска могла висеть на «Запуск…» вечно без следа в логе. Всё пишется в трассу запуска ([launch]).
export const START_LESSON_TIMEOUT_MS = 8000
export async function startLesson(lessonId, { timeoutMs = START_LESSON_TIMEOUT_MS } = {}) {
  const t0 = Date.now()
  traceLaunch(`start_lesson: запрос ${String(lessonId).slice(0, 8)}`)
  let timer
  const timeout = new Promise(r => { timer = setTimeout(() => r({ timedOut: true }), timeoutMs) })
  const res = await Promise.race([supabase.rpc('start_lesson', { p_lesson_id: lessonId }), timeout])
  clearTimeout(timer)
  if (res?.timedOut) { traceLaunch(`start_lesson: НЕТ ОТВЕТА ${timeoutMs} мс — открываем урок (как при ошибке RPC)`); return { ok: true, timedOut: true } }
  const { data, error } = res
  if (error) {
    console.error('[ENERGY] start_lesson RPC error:', error.message)
    traceLaunch(`start_lesson: ошибка RPC за ${Date.now() - t0} мс: ${error.message} — открываем урок`)
    return { ok: true }
  }
  traceLaunch(`start_lesson: ответ за ${Date.now() - t0} мс, ok=${data?.ok}`)
  dbg('[ENERGY] start_lesson →', lessonId, data)
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

// Помечает на сервере, что пользователь уже увидел и опробовал подсказку
// про замедление видео (см. useSlowMotionHint.js) — чтобы она не показалась
// снова на другом устройстве. Не критично — ошибку молча глотаем (тот же
// приём, что и для остальных необязательных RPC в этом файле).
export async function markSlowmoHintSeen() {
  const { error } = await supabase.rpc('mark_slowmo_hint_seen')
  if (error) console.error('[SLOWMO-HINT] mark_slowmo_hint_seen RPC error:', error.message)
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
