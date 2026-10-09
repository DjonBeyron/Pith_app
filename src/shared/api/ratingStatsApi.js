import { supabase } from './supabase.js'
import { dbg } from '../lib/debug.js'
import { normalizeStats, isMissingFnError, isDeniedError } from '../lib/ratingStats.js'

// Подробности игрока для попапа «Рейтинга»: RPC leaderboard_user_stats
// (миграция 20261008140000_leaderboard_user_stats.sql, поле achievements —
// 20261009100000_leaderboard_words.sql) — security definer, отдаёт только
// счётчики: слова в постоянной памяти, выученные фразы, достижения, рекорд серии.
// Результат — { state, stats }:
//   ok      — stats разобраны (normalizeStats);
//   missing — функции в БД ещё нет (миграция не применена) или игрок не найден;
//   denied  — нет прав (гость): подробности только для вошедших;
//   error   — сеть/сервер: попап покажет «Не удалось загрузить» и повтор.
// Удачные ответы держим в кэше на минуту, чтобы повторный тап по тому же игроку
// открывал попап сразу с данными; параллельные запросы схлопываем.
const TTL_MS = 60_000
const cache = new Map()    // userId → { at, value }
const inflight = new Map() // userId → Promise

// Свежее значение из кэша или null — для начального состояния попапа
export function peekUserStats(userId) {
  const hit = cache.get(userId)
  return hit && Date.now() - hit.at < TTL_MS ? hit.value : null
}

export function clearUserStatsCache() { cache.clear(); inflight.clear() }

export function fetchUserStats(userId, { force = false } = {}) {
  if (!userId) return Promise.resolve({ state: 'missing', stats: null })
  if (!force) {
    const hit = peekUserStats(userId)
    if (hit) return Promise.resolve(hit)
    if (inflight.has(userId)) return inflight.get(userId)
  }
  const p = (async () => {
    try {
      const { data, error } = await supabase.rpc('leaderboard_user_stats', { p_user: userId })
      if (error) {
        if (isMissingFnError(error)) {
          dbg('[RATING] нет leaderboard_user_stats — применить миграцию 20261008140000_leaderboard_user_stats.sql')
          return { state: 'missing', stats: null }
        }
        if (isDeniedError(error)) return { state: 'denied', stats: null }
        console.error('[RATING] leaderboard_user_stats:', error.message)
        return { state: 'error', stats: null }
      }
      const stats = normalizeStats(data)
      if (!stats) return { state: 'missing', stats: null }
      const value = { state: 'ok', stats }
      cache.set(userId, { at: Date.now(), value })
      return value
    } catch (e) {
      console.error('[RATING] leaderboard_user_stats:', e?.message ?? e)
      return { state: 'error', stats: null }
    } finally {
      inflight.delete(userId)
    }
  })()
  inflight.set(userId, p)
  return p
}
