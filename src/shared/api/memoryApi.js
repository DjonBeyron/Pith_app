import { supabase } from './supabase.js'
import { dbg } from '../lib/debug.js'

// Память повторения: тонкие обёртки над таблицей word_memory и RPC (миграция
// 20260924120000_word_memory.sql, см. PROJECT.md → «Система повторения»).
// Слово в память заносит СЕРВЕР сам — триггер на lesson_results при первом
// зачёте урока-слова; клиент только читает память и сообщает исход повторения.
// Только для залогиненных: гостю таблица закрыта (его память — локальная,
// этап 5). Без применённой миграции — пустая память, приложение не ломается.

// Вся память пользователя: [{ word, step, due_on, last_reviewed_at,
// last_card_id, reviews, lapses }]
export async function listWordMemory() {
  const { data, error } = await supabase
    .from('word_memory')
    .select('word, step, due_on, last_reviewed_at, last_card_id, reviews, lapses')
  if (error) { console.error('[MEMORY] word_memory:', error.message); return [] }
  return data ?? []
}

// Исход повторения слова (reviewOutcome.js). Шаг и дату считает сервер.
// { ok, word, prev_step, step, due_on, applied } | { ok: false, reason } | null
export async function reviewWord({ word, outcome, cardId = null, lessonId = null, source = 'review', events = null }) {
  const { data, error } = await supabase.rpc('memory_review_word', {
    p_word: word, p_outcome: outcome, p_card_id: cardId,
    p_lesson_id: lessonId, p_source: source, p_events: events,
  })
  if (error) { console.error('[MEMORY] memory_review_word:', error.message); return null }
  dbg('[MEMORY] memory_review_word →', data)
  return data ?? null
}

// Тест интервалов (только админ): «прожить» N дней — даты повторов своей
// памяти сдвигаются назад. Возвращает число сдвинутых слов.
export async function debugShiftMemory(days) {
  const { data, error } = await supabase.rpc('memory_debug_shift', { p_days: days })
  if (error) { console.error('[MEMORY] memory_debug_shift:', error.message); return null }
  return data ?? 0
}

// Конец сессии повторения (миграция 20260925140000_memory_finish_session.sql):
// сервер проверяет, что у каждого слова сессии есть исход за сегодня, и
// начисляет XP (2 за слово по расписанию, потолок 20 в день) + день серии.
// { ok, xp, xp_today, xp_cap, words, streak } | { ok: false, reason, missing? } | null
export async function finishReviewSession(words) {
  const { data, error } = await supabase.rpc('memory_finish_session', { p_words: words })
  if (error) { console.error('[MEMORY] memory_finish_session:', error.message); return null }
  dbg('[MEMORY] memory_finish_session →', data)
  return data ?? null
}

// «Сколько минут в день» (user_profiles.daily_minutes) → бюджет карточек
// (dailyPick.js). Отдельным запросом, а не в getProfile: без миграции памяти
// колонки нет, и падал бы весь профиль. Гость и сбой — 5 минут
export async function getDailyMinutes() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return 5
  const { data, error } = await supabase
    .from('user_profiles').select('daily_minutes').eq('id', session.user.id).maybeSingle()
  if (error) { console.error('[MEMORY] daily_minutes:', error.message); return 5 }
  return data?.daily_minutes ?? 5
}
