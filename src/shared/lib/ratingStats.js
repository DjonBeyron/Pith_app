import { plural } from './plural.js'

// Чистая логика попапа игрока в «Рейтинге» (UserStatsPopup.jsx): разбор ответа
// RPC leaderboard_user_stats и подписи. Без сети и React — покрыто тестом.

// Ступени памяти — те же названия и цвета, что в «Моей памяти»
// (features/learn/memoryLadder.js, styles/memory-ladder.css)
export const STEPS = [
  { key: 'new',   field: 'words_new',   label: 'Новые',     color: '#b6fe3b' },
  { key: 'known', field: 'words_known', label: 'Знакомые',  color: '#4fb3ee' },
  { key: 'solid', field: 'words_solid', label: 'Усвоенные', color: '#f1bd3c' },
  { key: 'perm',  field: 'words_perm',  label: 'Постоянная', color: '#a78bfa' },
]

const count = v => {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n > 0 ? n : 0
}

// Ответ RPC → { new, known, solid, perm, total, phrases, longestStreak } или null,
// если ответа нет / сервер сказал ok: false. Мусорные и отрицательные числа → 0
export function normalizeStats(raw) {
  if (!raw || typeof raw !== 'object' || raw.ok !== true) return null
  const s = {
    new: count(raw.words_new), known: count(raw.words_known),
    solid: count(raw.words_solid), perm: count(raw.words_perm),
    phrases: count(raw.phrases), longestStreak: count(raw.longest_streak),
  }
  return { ...s, total: s.new + s.known + s.solid + s.perm }
}

// Полосы ступеней: доля слов ступени от всех слов в памяти (0..1). Непустая
// ступень не тоньше 6% — чтобы полоска была видна; пустая — нулевая
export function stepBars(stats) {
  const total = stats?.total ?? 0
  return STEPS.map(st => {
    const n = stats?.[st.key] ?? 0
    return { ...st, count: n, share: n > 0 && total > 0 ? Math.min(1, Math.max(0.06, n / total)) : 0 }
  })
}

// Число с неразрывным пробелом между тысячами: 12345 → «12 345»
export function formatCount(n) {
  const v = Math.floor(Number(n))
  if (!Number.isFinite(v)) return '0'
  const body = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')
  return v < 0 ? `−${body}` : body
}

export const wordsLabel = n => plural(n, 'слово', 'слова', 'слов')
export const phrasesLabel = n => plural(n, 'фраза', 'фразы', 'фраз')
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
