import { supabase } from '../api/supabase.js'
import { viewSession } from '../api/viewSession.js'
import { pLog } from './debug.js'

// Хранение событий ответов (SKILL_ANALYSIS.md §6).
// Залогинен → lesson_results.answers (jsonb) через RPC append_lesson_answers.
// Гость → localStorage. Хранилища не смешиваются.

const LS_KEY     = 'pithy_skill_events_v1'
const MAX_EVENTS = 2000 // потолок лога: старейшие события отбрасываются

export function loadLocalEvents() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') } catch { return [] }
}

export function appendLocalEvents(events) {
  const merged = [...loadLocalEvents(), ...events].slice(-MAX_EVENTS)
  localStorage.setItem(LS_KEY, JSON.stringify(merged))
}

// Стереть локальные события указанных уроков-источников (сброс анализа)
export function clearLocalEvents(sourceLessonIds) {
  const keep = loadLocalEvents().filter(e => !sourceLessonIds.includes(e.sourceLessonId))
  localStorage.setItem(LS_KEY, JSON.stringify(keep))
}

// Дописывает события в lesson_results.answers через RPC append_lesson_answers
// (прямая запись в таблицу закрыта миграцией lesson_results_lockdown). Строку
// создаёт complete_lesson, поэтому вызывать строго ПОСЛЕ него.
// Мягкая деградация: если RPC ещё не применён в БД — старый прямой путь.
async function appendServerEvents(sourceLessonId, events) {
  const { data: total, error } = await supabase.rpc('append_lesson_answers', {
    p_lesson_id: sourceLessonId, p_events: events.slice(-MAX_EVENTS),
  })
  if (!error) {
    if (total < 0) { pLog('[stats] сервер: строка lesson_results не найдена (нет прохождения)'); return false }
    pLog(`[stats] сервер: сохранено +${events.length} событий (всего ${total})`)
    return true
  }
  const missing = error.code === 'PGRST202' || error.code === '42883'
  if (!missing) { pLog(`[stats] сервер: ошибка append_lesson_answers: ${error.message}`); return false }
  console.warn('[stats] RPC append_lesson_answers не применён в БД — прямая запись (устаревший путь)')
  return appendServerEventsLegacy(sourceLessonId, events)
}

async function appendServerEventsLegacy(sourceLessonId, events) {
  const { data, error } = await supabase
    .from('lesson_results')
    .select('id, answers')
    .eq('lesson_id', sourceLessonId)
    .maybeSingle()
  if (error || !data) {
    pLog(`[stats] сервер: строка lesson_results не найдена (${error?.message ?? 'нет прохождения'})`)
    return false
  }
  const prev   = Array.isArray(data.answers) ? data.answers : []
  const merged = [...prev, ...events].slice(-MAX_EVENTS)
  const { error: e2 } = await supabase
    .from('lesson_results')
    .update({ answers: merged })
    .eq('id', data.id)
  if (e2) { pLog(`[stats] сервер: ошибка записи answers: ${e2.message}`); return false }
  pLog(`[stats] сервер: сохранено +${events.length} событий (всего ${merged.length})`)
  return true
}

// Точка входа из плеера в конце урока. Без sourceLessonId (предпросмотр
// в редакторе) не сохраняет ничего.
export async function saveAnswerEvents(events, { sourceLessonId, isLoggedIn }) {
  if (!sourceLessonId || !events?.length) return
  if (isLoggedIn) {
    await appendServerEvents(sourceLessonId, events)
  } else {
    appendLocalEvents(events)
    pLog(`[stats] localStorage: сохранено +${events.length} событий`)
  }
}

// Весь лог для расчёта приоритетов (этап 4): гость — localStorage,
// залогиненный — answers всех своих строк lesson_results.
export async function loadAllEvents() {
  const user = (await viewSession())?.user
  if (!user) return loadLocalEvents()
  const { data, error } = await supabase.from('lesson_results').select('answers')
  if (error || !data) return []
  return data.flatMap(r => Array.isArray(r.answers) ? r.answers : [])
}
