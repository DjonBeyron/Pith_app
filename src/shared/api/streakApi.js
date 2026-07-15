import { supabase } from './supabase.js'
import { dbg } from '../lib/debug.js'

// Ежедневный стрик: тонкие обёртки над RPC (см. PROJECT.md → «Ежедневный
// стрик + окно наград»). Баланс XP/билетов/заморозок живёт только на
// сервере — клиент не передаёт суммы.

// Вызывается раз при загрузке приложения (useDailyLoginTouch). Считает
// вход, продлевает/спасает/сбрасывает серию (часовой пояс устройства —
// граница суток теперь считается локально, а не по МСК).
// { ok, streak, longest, saved_by: 'freeze'|'auto_freeze'|'pro_weekday'|
// 'pro_weekend'|null, reset?, lost_streak?, auto_claimed?: { days, xp,
// tickets }, guarded? }.
export async function touchDailyLogin() {
  const tz = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null } catch { return null }
  })()
  const { data, error } = await supabase.rpc('touch_daily_login', { p_tz: tz })
  if (error) { console.error('[STREAK] touch_daily_login:', error.message); return null }
  dbg('[STREAK] touch_daily_login →', data)
  return data ?? null
}

// Забрать награду за следующий незабранный день серии (строго по порядку).
// { ok, day, xp, tickets, special, reason?: 'nothing_to_claim' }.
export async function claimStreakReward() {
  const { data, error } = await supabase.rpc('claim_streak_reward')
  if (error) { console.error('[STREAK] claim_streak_reward:', error.message); return { ok: false } }
  dbg('[STREAK] claim_streak_reward →', data)
  return data ?? { ok: false }
}

// Забрать разом все накопленные незабранные дни серии.
// { ok, days, xp, tickets, special, reason?: 'nothing_to_claim' }.
export async function claimAllStreakRewards() {
  const { data, error } = await supabase.rpc('claim_streak_rewards_all')
  if (error) { console.error('[STREAK] claim_streak_rewards_all:', error.message); return { ok: false } }
  dbg('[STREAK] claim_streak_rewards_all →', data)
  return data ?? { ok: false }
}

// Покупка «Заморозки» — не стакается, ровно одна про запас.
export async function buyStreakFreeze() {
  const { data, error } = await supabase.rpc('buy_streak_freeze')
  if (error) { console.error('[STREAK] buy_streak_freeze:', error.message); return { ok: false } }
  dbg('[STREAK] buy_streak_freeze →', data)
  return data ?? { ok: false }
}

// Покупка «Авто заморозки» — только обычным пользователям (у PRO это
// правило работает бесплатно и автоматически внутри touch_daily_login).
export async function buyAutoFreeze() {
  const { data, error } = await supabase.rpc('buy_auto_freeze')
  if (error) { console.error('[STREAK] buy_auto_freeze:', error.message); return { ok: false } }
  dbg('[STREAK] buy_auto_freeze →', data)
  return data ?? { ok: false }
}

// Вехи наград для окна («путь дней») — публичное чтение, пишет только админ
// (см. streakMilestonesApi.js для CRUD).
export async function fetchStreakMilestones() {
  const { data, error } = await supabase
    .from('streak_milestones')
    .select('day_number, xp_reward, ticket_reward, special, label')
    .order('day_number', { ascending: true })
  if (error) { console.error('[STREAK] fetchStreakMilestones:', error.message); return [] }
  return data ?? []
}
