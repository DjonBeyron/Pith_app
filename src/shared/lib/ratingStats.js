import { plural } from './plural.js'
import { ACHIEVEMENTS } from './achievementKinds.js'

// Чистая логика попапа игрока в «Рейтинге» (UserStatsPopup.jsx): разбор ответа
// RPC leaderboard_user_stats, слова в строке рейтинга и подписи. Без сети и
// React — покрыто тестом.

const count = v => {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n > 0 ? n : 0
}

// Ответ RPC → { perm, phrases, longestStreak, achievements } или null, если
// ответа нет / сервер сказал ok: false. Мусорные и отрицательные числа → 0.
// achievements — null, если сервер его не прислал (миграция 20261009100000 не
// применена): попап тогда просто не показывает строку «Достижений». Не больше
// числа достижений, которые знает клиент (ACHIEVEMENTS) — как в профиле.
// Слова по ступеням памяти (words_new/known/solid) сервер ещё отдаёт для
// совместимости, но клиент их не показывает и не разбирает.
export function normalizeStats(raw) {
  if (!raw || typeof raw !== 'object' || raw.ok !== true) return null
  const hasAch = raw.achievements != null && Number.isFinite(Number(raw.achievements))
  return {
    perm: count(raw.words_perm),
    phrases: count(raw.phrases),
    longestStreak: count(raw.longest_streak),
    achievements: hasAch ? Math.min(count(raw.achievements), ACHIEVEMENTS.length) : null,
    achievementsTotal: ACHIEVEMENTS.length,
  }
}

// Сколько слов знает игрок в строке рейтинга: words_perm из get_leaderboard
// или null, если сервер его не прислал (миграция не применена) — тогда число
// в строке не рисуем
export function rowWords(row) {
  const v = row?.words_perm
  if (v == null || v === '' || !Number.isFinite(Number(v))) return null
  return count(v)
}

// Число с неразрывным пробелом между тысячами: 12345 → «12 345»
export function formatCount(n) {
  const v = Math.floor(Number(n))
  if (!Number.isFinite(v)) return '0'
  const body = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')
  return v < 0 ? `−${body}` : body
}

export const wordsLabel = n => plural(n, 'слово', 'слова', 'слов')
export const daysLabel = n => plural(n, 'день', 'дня', 'дней')

// Место: в топ-3 — медальный цвет, иначе null (обычный)
export const podiumPlace = place => (place >= 1 && place <= 3 ? place : null)

// Ошибка PostgREST «функции нет» (миграция не применена): PGRST202 (нет в кэше
// схемы), 42883 (undefined_function) или текст ошибки
export function isMissingFnError(error) {
  if (!error) return false
  const code = String(error.code ?? '')
  if (code === 'PGRST202' || code === '42883') return true
  return /could not find the function|does not exist/i.test(String(error.message ?? ''))
}

// Нет прав (гость / не авторизован): 42501 или 401/403
export function isDeniedError(error) {
  if (!error) return false
  const code = String(error.code ?? '')
  const status = Number(error.status)
  return code === '42501' || status === 401 || status === 403 || /permission denied/i.test(String(error.message ?? ''))
}
