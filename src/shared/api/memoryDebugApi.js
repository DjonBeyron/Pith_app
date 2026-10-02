import { supabase } from './supabase.js'
import { viewSession } from './viewSession.js'
import { localDate } from '../lib/memory/dailyPick.js'
import { wordKey } from '../lib/wordAudio/wordKey.js'
import { debugShiftGuest, debugTodayGuest, debugAddGuest, debugRemoveGuest, debugStepGuest } from '../lib/memory/guestMemory.js'

// Тест-инструменты админа над СВОЕЙ памятью слов (RPC memory_debug_*, только админ). В режиме «новенький» (песочница)
// вкладка «Память» читает локальную память, поэтому те же действия идут в неё (guestMemory.js) — иначе кнопки меняли бы
// сервер, а на экране ничего не менялось. Вынесено из memoryApi.js.
const isGuest = async () => !(await viewSession())?.user
const today = () => localDate(new Date())

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) { console.error(`[MEMORY] ${name}:`, error.message); return null }
  return data ?? null
}

// «Прожить» N дней: сроки слов И журнал повторений сдвигаются назад — бюджет карточек дня освобождается, как после смены
// даты (миграция 20261002130000_memory_debug_today.sql; раньше сдвигались только сроки). → число сдвинутых слов | null
export async function debugShiftMemory(days) {
  if (await isGuest()) return debugShiftGuest(days)
  return (await rpc('memory_debug_shift', { p_days: days })) ?? null
}

// Слова — к повтору сегодня (words — список слов; null — все слова памяти) и бюджет дня свободен (миграция
// 20261002130000_memory_debug_today.sql). → { ok, words, journal } | { ok: false, reason } | null
export async function debugDueToday(words = null) {
  if (await isGuest()) return debugTodayGuest(words && words.map(wordKey), today())
  return rpc('memory_debug_today', { p_words: words })
}

// Занести слово в память «к повтору сегодня» без прохождения урока (миграция 20260925200000_memory_debug_add.sql).
// Уже в памяти — шаг тот же, срок на сегодня. { ok, word, step, due_on } | { ok: false, reason } | null
export async function debugAddWord(word) {
  if (await isGuest()) return debugAddGuest(wordKey(word), today())
  return rpc('memory_debug_add', { p_word: word })
}

// Убрать слово из памяти. 1 — убрано, 0 — не было, null — ошибка
export async function debugRemoveWord(word) {
  if (await isGuest()) return debugRemoveGuest(wordKey(word))
  return (await rpc('memory_debug_remove', { p_word: word })) ?? null
}

// Пройти слово по уровням памяти до конца — action 'next' (как верный повтор в срок: шаг +1; на шаге 5 — в постоянную
// память; в постоянной — дальше некуда, end: true) — и 'reset' (как новое слово, к повтору СЕГОДНЯ: шаг 1, постоянная
// снимается; миграции 20261001140000_memory_debug_step.sql и 20261002130000_memory_debug_today.sql). Журнал не пишется.
// { ok, word, prev_step, step, due_on, settled, end } | { ok: false, reason } | null
export async function debugStepWord(word, action) {
  if (await isGuest()) return debugStepGuest(wordKey(word), action, today())
  return rpc('memory_debug_step', { p_word: word, p_action: action })
}
