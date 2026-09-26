import { supabase } from './supabase.js'
import { dbg } from '../lib/debug.js'
import { localDate } from '../lib/memory/dailyPick.js'
import {
  listGuestMemory, reviewGuestWord, listGuestReviews, clearGuestMemory, getGuestMinutes, setGuestMinutes,
  getGuestPhrases, addGuestPhrase,
} from '../lib/memory/guestMemory.js'

// Память повторения: тонкие обёртки над таблицей word_memory и RPC (миграция
// 20260924120000_word_memory.sql, см. PROJECT.md → «Система повторения»).
// Слово в память заносит СЕРВЕР сам — триггер на lesson_results при первом
// зачёте урока-слова; клиент только читает память и сообщает исход повторения.
// Гостю таблица закрыта — его память локальная (guestMemory.js): чтение,
// исход повторения и журнал ниже сами уходят туда, если сессии нет. После
// входа память гостя переносится в аккаунт (importGuestMemory). Без
// применённой миграции — пустая память, приложение не ломается.

const isGuest = async () => !(await supabase.auth.getSession()).data.session?.user
const today = () => localDate(new Date())

// Вся память пользователя: [{ word, step, due_on, settled_on,
// last_reviewed_at, last_card_id, reviews, lapses }]. settled_on — постоянная
// память (миграция 20260926120000_memory_settled.sql); без неё — читаем без
// колонки, постоянной памяти просто нет
const MEMORY_COLS = 'word, step, due_on, last_reviewed_at, last_card_id, reviews, lapses'
export async function listWordMemory() {
  if (await isGuest()) return listGuestMemory()
  let { data, error } = await supabase.from('word_memory').select(`${MEMORY_COLS}, settled_on`)
  if (error && /settled_on/.test(error.message)) {
    dbg('[MEMORY] нет колонки settled_on — применить миграцию 20260926120000_memory_settled.sql')
    ;({ data, error } = await supabase.from('word_memory').select(MEMORY_COLS))
  }
  if (error) { console.error('[MEMORY] word_memory:', error.message); return [] }
  return data ?? []
}

// Есть ли слово в памяти: итог урока сравнивает до и после зачёта — слово
// впервые во временной памяти → карточка «Новое слово». null — не узнали
export async function hasMemoryWord(word) {
  if (await isGuest()) return listGuestMemory().some(m => m.word === word)
  const { data, error } = await supabase.from('word_memory').select('word').eq('word', word).limit(1)
  if (error) { dbg('[MEMORY] hasMemoryWord:', error.message); return null }
  return (data ?? []).length > 0
}

// Исход повторения слова (reviewOutcome.js). Шаг и дату считает сервер.
// { ok, word, prev_step, step, due_on, applied, settled, settled_on } | { ok: false, reason } | null
// (settled — слово ушло в постоянную память этим ответом)
export async function reviewWord({ word, outcome, cardId = null, lessonId = null, source = 'review', events = null }) {
  if (await isGuest()) return reviewGuestWord({ word, outcome, cardId, events, source }, today())
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

// Только админ (миграция 20260925200000_memory_debug_add.sql): занести слово
// в свою память «к повтору сегодня» без прохождения урока — проверить вкладку
// «Моё обучение». Уже в памяти — шаг тот же, срок на сегодня.
// { ok, word, step, due_on } | { ok: false, reason } | null
export async function debugAddWord(word) {
  const { data, error } = await supabase.rpc('memory_debug_add', { p_word: word })
  if (error) { console.error('[MEMORY] memory_debug_add:', error.message); return null }
  return data ?? null
}

// Только админ: убрать слово из своей памяти. 1 — убрано, 0 — не было, null — ошибка
export async function debugRemoveWord(word) {
  const { data, error } = await supabase.rpc('memory_debug_remove', { p_word: word })
  if (error) { console.error('[MEMORY] memory_debug_remove:', error.message); return null }
  return data ?? 0
}

// Конец сессии повторения (миграция 20260925140000_memory_finish_session.sql):
// сервер проверяет, что у каждого слова сессии есть исход за сегодня, и
// начисляет XP (2 за слово по расписанию, потолок 20 в день) + день серии.
// { ok, xp, xp_today, xp_cap, words, streak } | { ok: false, reason, missing? } | null
// Гостю — ни XP, ни серии (они серверные): { ok, guest: true } — итог позовёт войти
export async function finishReviewSession(words) {
  if (await isGuest()) return { ok: true, guest: true, xp: 0, streak: null }
  const { data, error } = await supabase.rpc('memory_finish_session', { p_words: words })
  if (error) { console.error('[MEMORY] memory_finish_session:', error.message); return null }
  dbg('[MEMORY] memory_finish_session →', data)
  return data ?? null
}

// Настройки повторения из профиля: «Сколько минут в день» (daily_minutes →
// бюджет карточек, dailyPick.js) и «Отпуск» (vacation_since — дата начала
// паузы или null). Отдельным запросом, а не в getProfile: без миграций колонок
// нет, и падал бы весь профиль; без миграции «Отпуска» — только минуты.
// Гость и сбой — 5 минут, не в отпуске. → { minutes, vacationSince }
export async function getMemoryProfile() {
  const none = { minutes: 5, vacationSince: null }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return { minutes: getGuestMinutes(), vacationSince: null }
  const q = cols => supabase.from('user_profiles').select(cols).eq('id', session.user.id).maybeSingle()
  let { data, error } = await q('daily_minutes, vacation_since')
  if (error && /vacation_since/.test(error.message)) ({ data, error } = await q('daily_minutes'))
  if (error) { console.error('[MEMORY] профиль повторения:', error.message); return none }
  return { minutes: data?.daily_minutes ?? 5, vacationSince: data?.vacation_since ?? null }
}

// «Отпуск»: on=true — пауза расписания с сегодняшнего дня; false — вернуться
// (сервер сдвигает сроки памяти на число дней отпуска). Миграция
// 20260925150000_memory_vacation.sql. { ok, on, since? , days?, shifted? } | null
export async function setVacation(on) {
  const { data, error } = await supabase.rpc('memory_set_vacation', { p_on: on })
  if (error) { console.error('[MEMORY] memory_set_vacation:', error.message); return null }
  dbg('[MEMORY] memory_set_vacation →', data)
  return data ?? null
}

// Свой журнал повторений за последние N дней (review_events, свои строки по
// RLS): сколько карточек уже показано сегодня (бюджет дня) и итоги недели.
// [{ word, outcome, source, step_before, step_after, applied, events, created_at }]
export async function listRecentReviews(days = 7) {
  if (await isGuest()) return listGuestReviews(days, today())
  const since = new Date()
  since.setHours(0, 0, 0, 0)
  since.setDate(since.getDate() - (days - 1))
  const { data, error } = await supabase
    .from('review_events')
    .select('word, outcome, source, step_before, step_after, applied, events, created_at')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true })
  if (error) { console.error('[MEMORY] review_events:', error.message); return [] }
  return data ?? []
}

// После входа: память гостя (localStorage) — в аккаунт, RPC memory_import_guest
// (миграция 20260925160000_memory_import_guest.sql; сервер берёт только
// настоящие слова и не трогает те, что в аккаунте уже есть). Удалось — память
// гостя чистится. → число перенесённых слов | null
export async function importGuestMemory() {
  const words = listGuestMemory()
  if (!words.length) return 0
  const { data, error } = await supabase.rpc('memory_import_guest', { p_words: words })
  if (error || !data?.ok) { console.error('[MEMORY] memory_import_guest:', error?.message ?? data?.reason); return null }
  clearGuestMemory()
  dbg('[MEMORY] память гостя перенесена:', data.imported)
  return data.imported
}

// «Сколько минут в день?» (5 | 10 | 15): в аккаунте — RPC memory_set_daily_minutes
// (миграция 20260925170000_memory_daily_minutes.sql), гостю — локально
export async function setDailyMinutes(minutes) {
  if (await isGuest()) { setGuestMinutes(minutes); return { ok: true, minutes } }
  const { data, error } = await supabase.rpc('memory_set_daily_minutes', { p_minutes: minutes })
  if (error) { console.error('[MEMORY] memory_set_daily_minutes:', error.message); return null }
  return data ?? null
}

// Закреплённые фразы (миграция 20260925190000_phrase_memory.sql): Set id модулей.
// Гостю — локальные. Без миграции — пусто
export async function listPhraseMemory() {
  if (await isGuest()) return getGuestPhrases()
  const { data, error } = await supabase.from('phrase_memory').select('module_id')
  if (error) { console.error('[MEMORY] phrase_memory:', error.message); return new Set() }
  return new Set((data ?? []).map(r => r.module_id))
}

// Фраза собрана — закрепить (сервер проверит, что все её слова на шаге ≥ 3)
export async function consolidatePhrase(moduleId) {
  if (await isGuest()) { addGuestPhrase(moduleId); return { ok: true } }
  const { data, error } = await supabase.rpc('memory_consolidate_phrase', { p_module_id: moduleId })
  if (error) { console.error('[MEMORY] memory_consolidate_phrase:', error.message); return null }
  return data ?? null
}
