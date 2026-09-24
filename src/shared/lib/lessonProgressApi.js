import { supabase } from '../api/supabase.js'
import { dbg } from './debug.js'

// Чекпойнт «докуда дошёл в уроке» — для попапа «Продолжить / Начать заново»
// при повторном входе (см. LessonPlayer.jsx) и для процента в «Мои уроки»
// (список/лента, MyLessons.jsx). pct — 0..100, посчитан один раз на клиенте
// в момент чекпойнта (граф урока уже в памяти), тут только хранится — иначе
// список пришлось бы грузить весь граф урока ради одной цифры.
// Гость — localStorage (свой на каждый lessonId, без переноса на сервер при
// входе: это не критичная потеря, в отличие от completedLessons.js).
const LS_PREFIX = 'pithy_lesson_progress_'

// «Прогресс урока изменился» — схема модуля обновляет полоску «урок начат»
// сразу, без повторного запроса (useLessonsProgress.js). pct null — сброшен
export const PROGRESS_EVENT = 'pithy:lesson-progress'
function notify(lessonId, pct, started = false) {
  try { window.dispatchEvent(new CustomEvent(PROGRESS_EVENT, { detail: { lessonId, pct, started } })) } catch { /* нет window — не страшно */ }
}

// Флаг «урок начат» — отдельно от чекпойнта. Чекпойнт (а с ним «Продолжить»)
// пишется только с 6-й ноды, и вышедший раньше видел на схеме «Урок ещё не
// начат» — неправда. Флаг ставится при каждом входе в урок, схема по нему
// рисует полоску с 1%. Только на этом устройстве (localStorage) — это
// подсказка на карточке, не данные прогресса. Снимается вместе с чекпойнтом
const STARTED_PREFIX = 'pithy_lesson_started_'

export function markLessonStarted(lessonId) {
  try { localStorage.setItem(STARTED_PREFIX + lessonId, '1') } catch { /* недоступен */ }
  notify(lessonId, null, true)
}

export function isLessonStarted(lessonId) {
  try { return localStorage.getItem(STARTED_PREFIX + lessonId) === '1' } catch { return false }
}

async function currentUser() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
}

export async function getLessonProgress(lessonId) {
  const user = await currentUser()
  if (!user) {
    try {
      const raw = localStorage.getItem(LS_PREFIX + lessonId)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }
  const { data, error } = await supabase
    .from('lesson_progress')
    .select('node_id, pct, updated_at, visited_ids')
    .eq('lesson_id', lessonId)
    .maybeSingle()
  if (error) { dbg('[DB ERROR] lesson_progress get', error.message); return null }
  return data
    ? { nodeId: data.node_id, pct: data.pct, updatedAt: data.updated_at, visitedIds: data.visited_ids ?? [] }
    : null
}

// xp — сколько XP уже заработано К МОМЕНТУ чекпойнта (LessonPlayer.jsx,
// earnedXpRef.current). Нужен ТОЛЬКО гостю: у него итоговый XP на "Продолжить
// урок" собирается локально из earnedXpRef, а фид возобновления не переигрывает
// старые ноды — без xp в чекпойнте вклад нод до закрытия терялся бы совсем.
// У залогиненного сервер сам считает итог по lessonXp урока (completeLesson) —
// xp в lesson_progress ему не нужен, в БД не пишем (нет колонки, и не будет).
// visitedIds — id всех показанных нод по порядку (с учётом повторов —
// appendVisit сам держит каждую ноду один раз, сдвигая к концу при повторном
// показе), нужен ОБОИМ: восстановить историю чата ВЫШЕ точки входа при
// «Продолжить урок» (useGraphPlayer.js)
export async function saveLessonProgress(lessonId, nodeId, pct = 0, xp = 0, visitedIds = []) {
  notify(lessonId, pct)
  const user = await currentUser()
  if (!user) {
    try {
      localStorage.setItem(LS_PREFIX + lessonId, JSON.stringify({ nodeId, pct, xp, visitedIds, updatedAt: new Date().toISOString() }))
    } catch { /* localStorage недоступен — пропускаем */ }
    return
  }
  const { error } = await supabase.from('lesson_progress').upsert(
    { user_id: user.id, lesson_id: lessonId, node_id: nodeId, pct, visited_ids: visitedIds, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,lesson_id' },
  )
  if (error) dbg('[DB ERROR] lesson_progress save', error.message)
}

export async function clearLessonProgress(lessonId) {
  try { localStorage.removeItem(STARTED_PREFIX + lessonId) } catch { /* недоступен */ }
  notify(lessonId, null)
  const user = await currentUser()
  if (!user) {
    try { localStorage.removeItem(LS_PREFIX + lessonId) } catch { /* недоступен */ }
    return
  }
  const { error } = await supabase.from('lesson_progress')
    .delete().eq('user_id', user.id).eq('lesson_id', lessonId)
  if (error) dbg('[DB ERROR] lesson_progress clear', error.message)
}

// Массово: у каких уроков ИЗ списка есть активный чекпойнт (пройден не до
// конца, но начат снова после завершения) → lessonId => pct. Нужно, чтобы
// «Мои уроки» решали, что показывать: модуль/урок на 100% обычно скрыт, но
// пока идёт пересдача — на время снова виден с текущим процентом.
export async function listLessonsWithProgress(lessonIds) {
  if (!lessonIds.length) return new Map()
  const user = await currentUser()
  if (!user) {
    const map = new Map()
    for (const id of lessonIds) {
      try {
        const raw = localStorage.getItem(LS_PREFIX + id)
        if (raw) map.set(id, JSON.parse(raw).pct ?? 0)
      } catch { /* пропускаем */ }
    }
    return map
  }
  const { data, error } = await supabase
    .from('lesson_progress')
    .select('lesson_id, pct')
    .in('lesson_id', lessonIds)
  if (error) { dbg('[DB ERROR] lesson_progress list', error.message); return new Map() }
  return new Map((data ?? []).map(r => [r.lesson_id, r.pct]))
}
