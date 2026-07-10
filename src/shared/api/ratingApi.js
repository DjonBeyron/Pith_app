import { supabase } from './supabase.js'
import { dbg } from '../lib/debug.js'

// Глобальный рейтинг по XP (RPC get_leaderboard — security definer, отдаёт
// только ник/XP/косметику; чужие профили напрямую закрыты RLS).
export async function fetchLeaderboard(limit = 100) {
  const { data, error } = await supabase.rpc('get_leaderboard', { p_limit: limit })
  if (error) { console.error('[RATING] get_leaderboard:', error.message); return [] }
  dbg('[RATING] топ:', data?.length ?? 0, 'строк',
    data?.length ? `лидер: ${data[0].nickname} (${data[0].xp} XP)` : '')
  return data ?? []
}

// Своё место в рейтинге: { rank, total } или null (гость/админ/нет RPC).
export async function fetchMyRank() {
  const { data, error } = await supabase.rpc('get_my_rank')
  if (error) { console.error('[RATING] get_my_rank:', error.message); return null }
  dbg('[RATING] моё место:', data ? `${data.rank} из ${data.total}` : 'нет (гость/админ)')
  return data ?? null
}

// Мои открытые достижения: [{ kind, meta, unlocked_at }].
export async function fetchMyAchievements() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return []
  const { data, error } = await supabase
    .from('user_achievements')
    .select('kind, meta, unlocked_at')
    .eq('user_id', session.user.id)
  if (error) { console.error('[RATING] achievements:', error.message); return [] }
  dbg('[RATING] мои достижения:', (data ?? []).map(a => a.kind + (a.meta?.place ? `(место ${a.meta.place})` : '')).join(', ') || 'нет')
  return data ?? []
}

// Надеть/снять косметику: { bg, frame, medal }. Сервер пропускает только
// открытое достижениями, возвращает фактически применённый набор.
export async function saveCosmetics(cosmetics) {
  const { data, error } = await supabase.rpc('set_cosmetics', { p_cosmetics: cosmetics })
  if (error) { console.error('[RATING] set_cosmetics:', error.message); return null }
  dbg('[RATING] косметика: просили', cosmetics, '→ сервер применил', data)
  return data ?? {}
}

// Смена ника. Сервер: 2–20 символов; лимиты — 1-я смена бесплатно, 2-я через
// 7 дней, дальше раз в 30 дней (админ без лимитов). Возвращает { nick, error }.
export async function saveNickname(nick) {
  const { data, error } = await supabase.rpc('set_nickname', { p_nick: nick })
  if (error) return { nick: null, error: error.message }
  dbg('[RATING] set_nickname →', data)
  if (data?.ok) return { nick: data.nick, error: null }
  const msg = data?.reason === 'too_short' ? 'Ник слишком короткий (минимум 2 символа)'
    : data?.reason === 'too_soon' ? `Ник можно сменить после ${new Date(data.next_at).toLocaleDateString('ru', { day: 'numeric', month: 'long' })}`
    : data?.reason === 'not_logged_in' ? 'Войди в аккаунт'
    : 'Не удалось сменить ник'
  return { nick: null, error: msg }
}

// «10-й уровень»: клиент зовёт при достижении порога, сервер проверяет XP сам.
export async function claimLevelAchievement() {
  const { data, error } = await supabase.rpc('claim_level_achievement')
  if (error) { console.error('[RATING] claim_level:', error.message); return false }
  dbg('[RATING] заявка «10-й уровень» →', data === true ? 'выдано' : 'отказ (XP < порога)')
  return data === true
}
