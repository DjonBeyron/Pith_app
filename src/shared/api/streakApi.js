import { supabase } from './supabase.js'
import { dbg } from '../lib/debug.js'

// Ежедневный стрик: тонкие обёртки над RPC (см. PROJECT.md → «Ежедневный
// стрик + окно наград»). Баланс XP/билетов/заморозок живёт только на
// сервере — клиент не передаёт суммы.

// Вызывается при загрузке приложения и при возврате из фона (useStreakGate).
// Считает ВИЗИТ и решает судьбу серии (спасти заморозкой/PRO или сбросить),
// но саму серию НЕ наращивает — день закрывает только пройденный урок
// (bumpStreakOnLesson). Граница суток — в поясе устройства.
// { ok, first_today, streak, longest, today, saved_by: 'freeze'|'auto_freeze'|
// 'pro_weekday'|'pro_weekend'|null, missed_days, missed_weekend_only, reset?,
// lost_streak?, auto_claimed?: { days, xp, tickets }, has_freeze_charge,
// auto_freeze_charges_left, is_pro, pro_weekday_used }.
export async function touchDailyLogin() {
  const tz = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null } catch { return null }
  })()
  const { data, error } = await supabase.rpc('touch_daily_login', { p_tz: tz })
  if (error) { console.error('[STREAK] touch_daily_login:', error.message); return null }
  dbg('[STREAK] touch_daily_login →', data)
  return data ?? null
}

// Зачёт дня серии за пройденный урок (зовётся из useLessonFinish после
// completeLesson). Идемпотентна в пределах суток: второй урок за день вернёт
// incremented: false. { ok, streak, prev_streak?, incremented, longest?,
// reason?: 'already_today', guarded?: true }.
export async function bumpStreakOnLesson() {
  const { data, error } = await supabase.rpc('bump_streak_on_lesson')
  if (error) { console.error('[STREAK] bump_streak_on_lesson:', error.message); return null }
  dbg('[STREAK] bump_streak_on_lesson →', data)
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
// (см. streakMilestonesApi.js для CRUD). Возвращает null при сетевой ошибке
// (не []), чтобы RewardsPopup мог отличить «пусто» от «не загрузилось» и
// показать кнопку «Повторить».
export async function fetchStreakMilestones() {
  const { data, error } = await supabase
    .from('streak_milestones')
    .select('day_number, xp_reward, ticket_reward, special, label')
    .order('day_number', { ascending: true })
  if (error) { console.error('[STREAK] fetchStreakMilestones:', error.message); return null }
  return data ?? []
}
