import { supabase } from './supabase.js'
import { dbg } from '../lib/debug.js'

// ── Звёзды уроков: клиентский API ──
// Сервер хранит лучший результат в lesson_results.stars (RPC save_lesson_stars,
// только вверх). Чтение — своя строка по RLS results_own.

// Сохранить звёзды урока (зовётся после completeLesson — строка уже есть).
// Возвращает итоговые звёзды на сервере (0 — строки нет / RPC не применён).
export async function saveLessonStars(lessonId, stars) {
  const { data, error } = await supabase.rpc('save_lesson_stars', {
    p_lesson_id: lessonId, p_stars: stars,
  })
  if (error) { console.error('[STARS] save_lesson_stars:', error.message); return 0 }
  dbg('[STARS] save(урок', lessonId, ',', stars, '★) → на сервере', data)
  return data ?? 0
}

// Мои звёзды по списку уроков: Map<lessonId, stars>. Гостю вернёт пустую.
export async function fetchMyLessonStars(ids) {
  if (!ids?.length) return new Map()
  const { data, error } = await supabase
    .from('lesson_results').select('lesson_id, stars')
    .in('lesson_id', ids).gt('stars', 0)
  if (error) { console.error('[STARS] fetchMyLessonStars:', error.message); return new Map() }
  dbg('[STARS] с сервера:', data?.length ?? 0, 'уроков со звёздами')
  return new Map((data ?? []).map(r => [r.lesson_id, r.stars]))
}
