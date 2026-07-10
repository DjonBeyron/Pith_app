import { supabase } from './supabase.js'
import { dbg } from '../lib/debug.js'

// ── Супергонка: клиентский API ──
// Таблица races читается всеми (анонс публичен), пишет только админ.
// Результаты — race_entries (своя строка) + RPC finish/finalize/results.

// Все гонки для админ-панели (свежие сверху).
export async function loadRaces() {
  const { data, error } = await supabase
    .from('races').select('*').order('created_at', { ascending: false })
  if (error) { console.error('[RACE] loadRaces:', error.message); return [] }
  return data ?? []
}

// Создать/обновить гонку (админ). race: { id?, title, description,
// race_lesson_id, prep_lesson_ids, starts_at, ends_at }.
export async function saveRace(race) {
  const { data, error } = await supabase
    .from('races').upsert(race).select().single()
  if (error) { console.error('[RACE] saveRace:', error.message); return { race: null, error: error.message } }
  return { race: data, error: null }
}

export async function deleteRace(id) {
  const { error } = await supabase.from('races').delete().eq('id', id)
  if (error) console.error('[RACE] deleteRace:', error.message)
  return !error
}

// Актуальная гонка для пользователя: ближайшая будущая или идущая; если таких
// нет — последняя завершённая (для показа итогов). null — гонок нет вообще.
export async function fetchCurrentRace() {
  const { data, error } = await supabase
    .from('races').select('*')
    .not('starts_at', 'is', null)
    .order('starts_at', { ascending: false })
    .limit(10)
  if (error) { console.error('[RACE] fetchCurrentRace:', error.message); return null }
  const races = data ?? []
  const now = Date.now()
  // Идущая или будущая (самая ранняя из будущих)
  const upcoming = races
    .filter(r => new Date(r.ends_at).getTime() > now)
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
  const picked = upcoming[0] ?? races[0] ?? null
  dbg('[RACE] гонок с датами:', races.length,
    '→ выбрана:', picked ? `«${picked.title}» ${picked.starts_at} — ${picked.ends_at}` : 'нет')
  return picked
}

// Моя запись в гонке (RLS отдаёт только свою): null — ещё не финишировал.
export async function fetchMyEntry(raceId) {
  const { data, error } = await supabase
    .from('race_entries').select('*')
    .eq('race_id', raceId).maybeSingle()
  if (error) { console.error('[RACE] fetchMyEntry:', error.message); return null }
  dbg('[RACE] моя запись в гонке:', data
    ? `ошибок ${data.errors}, время ${data.time_ms}мс, финиш ${data.finished_at}, место ${data.place}`
    : 'нет')
  return data
}

// Финиш: сервер принимает один раз. Возвращает { ok, reason? }.
export async function finishRace(raceId, errors, timeMs) {
  const { data, error } = await supabase.rpc('finish_race', {
    p_race_id: raceId, p_errors: errors, p_time_ms: timeMs,
  })
  if (error) { console.error('[RACE] finish_race:', error.message); return { ok: false, reason: error.message } }
  dbg('[RACE] finish_race(ошибок', errors, ', время', timeMs, 'мс) →', data)
  return data ?? { ok: false }
}

// Временное место среди уже финишировавших: { rank, total } | null.
export async function fetchMyRaceRank(raceId) {
  const { data, error } = await supabase.rpc('get_my_race_rank', { p_race_id: raceId })
  if (error) { console.error('[RACE] get_my_race_rank:', error.message); return null }
  dbg('[RACE] временное место:', data ? `${data.rank} из ${data.total}` : 'нет')
  return data ?? null
}

// Подвести итоги (идемпотентно, зовёт первый клиент после окончания).
export async function finalizeRace(raceId) {
  const { data, error } = await supabase.rpc('finalize_race', { p_race_id: raceId })
  if (error) { console.error('[RACE] finalize_race:', error.message); return false }
  dbg('[RACE] finalize_race →', data === true ? 'итоги подведены сейчас' : 'уже подведены или рано')
  return data === true
}

// Итоговая таблица: [{ place, user_id, nickname, cosmetics, medal_place, score }].
export async function fetchRaceResults(raceId) {
  const { data, error } = await supabase.rpc('get_race_results', { p_race_id: raceId })
  if (error) { console.error('[RACE] get_race_results:', error.message); return [] }
  dbg('[RACE] итоги гонки:', (data ?? []).map(r => `${r.place}. ${r.nickname} (${r.score})`).join(' | ') || 'пусто')
  return data ?? []
}

// Уроки списка гонки: [{ id, title, xp }] в порядке ids. Тянем только XP
// урока (script->>lessonXp), не весь граф.
export async function fetchRaceLessons(ids) {
  if (!ids?.length) return []
  const { data, error } = await supabase
    .from('lessons').select('id, title, xp:script->>lessonXp').in('id', ids)
  if (error) { console.error('[RACE] fetchRaceLessons:', error.message); return [] }
  const byId = new Map((data ?? []).map(l => [l.id, l]))
  return ids
    .map(id => byId.get(id))
    .filter(Boolean)
    .map(l => ({ id: l.id, title: l.title, xp: parseInt(l.xp, 10) || 0 }))
}

// Модули заданий гонки: [{ id, title, lessons: [{ id, title, xp }], xp }]
// в порядке ids. XP модуля = сумма XP его уроков.
export async function fetchRaceModules(ids) {
  if (!ids?.length) return []
  const { data, error } = await supabase
    .from('curricula').select('id, title, lesson_ids').in('id', ids)
  if (error) { console.error('[RACE] fetchRaceModules:', error.message); return [] }
  const byId = new Map((data ?? []).map(m => [m.id, m]))
  const ordered = ids.map(id => byId.get(id)).filter(Boolean)
  const allLessonIds = [...new Set(ordered.flatMap(m => m.lesson_ids ?? []))]
  const lessons = await fetchRaceLessons(allLessonIds)
  const lessonById = new Map(lessons.map(l => [l.id, l]))
  return ordered.map(m => {
    const ls = (m.lesson_ids ?? []).map(id => lessonById.get(id)).filter(Boolean)
    return { id: m.id, title: m.title, lessons: ls, xp: ls.reduce((s, l) => s + l.xp, 0) }
  })
}

// Какие из ids я уже прошёл (сервер, xp_awarded=true — сброшенные не в счёт).
// RLS отдаёт только свои строки; гостю вернёт пустой Set.
export async function fetchMyCompletedLessonIds(ids) {
  if (!ids?.length) return new Set()
  const { data, error } = await supabase
    .from('lesson_results').select('lesson_id')
    .in('lesson_id', ids).eq('xp_awarded', true)
  if (error) { console.error('[RACE] fetchMyCompleted:', error.message); return new Set() }
  dbg('[RACE] пройдено из списка (сервер):', data?.length ?? 0, 'из', ids.length)
  return new Set((data ?? []).map(r => r.lesson_id))
}
