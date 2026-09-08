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
    .select('node_id, pct, updated_at')
    .eq('lesson_id', lessonId)
    .maybeSingle()
  if (error) { dbg('[DB ERROR] lesson_progress get', error.message); return null }
  return data ? { nodeId: data.node_id, pct: data.pct, updatedAt: data.updated_at } : null
}

export async function saveLessonProgress(lessonId, nodeId, pct = 0) {
  const user = await currentUser()
  if (!user) {
    try {
      localStorage.setItem(LS_PREFIX + lessonId, JSON.stringify({ nodeId, pct, updatedAt: new Date().toISOString() }))
    } catch { /* localStorage недоступен — пропускаем */ }
    return
  }
  const { error } = await supabase.from('lesson_progress').upsert(
    { user_id: user.id, lesson_id: lessonId, node_id: nodeId, pct, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,lesson_id' },
  )
  if (error) dbg('[DB ERROR] lesson_progress save', error.message)
}

export async function clearLessonProgress(lessonId) {
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
