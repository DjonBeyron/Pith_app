import { localDate } from './dailyPick.js'
import { lessonWordOf } from './wordLessons.js'

// Память повторения ГОСТЯ — в localStorage (PROJECT.md → «Онбординг»: память
// гостя локальная, при регистрации переносится — RPC memory_import_guest).
// Правила шагов — зеркало серверной memory_review_word (миграция
// 20260924120000_word_memory.sql): меняешь одно — меняй другое.
//   good / know → шаг +1 (на шаге 5 — остаётся, поддержка 60 дней)
//   hard        → шаг тот же, интервал текущего шага
//   again / fail→ шаг −1 / −2, завтра
//   верный ответ раньше срока шаг не двигает (applied = false)
//   от 7 дней — разброс ±1 день
//   постоянная память (миграция 20260926120000_memory_settled.sql): верный
//   ответ в срок на шаге 5 → settled_on = сегодня; again / fail → null
const MEM_KEY = 'pithy_guest_memory_v1'
const LOG_KEY = 'pithy_guest_reviews_v1'
const LOG_DAYS = 30

export const intervalFor = step => ({ 1: 1, 2: 3, 3: 7, 4: 16 })[step] ?? 35

export function addDays(date, n) {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + n)
  return localDate(d)
}

// Чистое ядро: строка памяти + исход → { row, prevStep, applied, settled }
// (settled — слово ушло в постоянную память именно сейчас)
export function applyReview(row, outcome, today, rand = Math.random) {
  let step = row.step
  let due = row.due_on
  let applied = true
  let settledOn = row.settled_on ?? null
  if (outcome === 'again' || outcome === 'fail') {
    step = Math.max(1, row.step - (outcome === 'fail' ? 2 : 1))
    due = addDays(today, 1)
    settledOn = null
  } else if (row.due_on > today) {
    applied = false
  } else {
    let days
    if (outcome === 'hard') days = intervalFor(row.step)
    else if (row.step >= 5) { step = 5; days = 60; settledOn = settledOn ?? today }
    else { step = row.step + 1; days = intervalFor(step) }
    if (days >= 7) days += Math.floor(rand() * 3) - 1
    due = addDays(today, days)
  }
  return {
    prevStep: row.step,
    applied,
    settled: !row.settled_on && !!settledOn,
    row: {
      ...row, step, due_on: due, settled_on: settledOn,
      reviews: (row.reviews ?? 0) + 1,
      lapses: (row.lapses ?? 0) + (outcome === 'again' || outcome === 'fail' ? 1 : 0),
    },
  }
}

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback } catch { return fallback }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* приватный режим — память не сохранится */ }
}

// [{ word, step, due_on, settled_on?, last_card_id, reviews, lapses }] — как строки word_memory
export function listGuestMemory() {
  return Object.values(read(MEM_KEY, {}))
}

export const hasGuestMemory = () => listGuestMemory().length > 0

// Урок-слово пройден гостем — слово в память, повторить завтра (как триггер
// word_memory_seed на сервере). Уже есть — не трогаем
export function seedGuestWord(word, today) {
  if (!word) return
  const mem = read(MEM_KEY, {})
  if (mem[word]) return
  mem[word] = { word, step: 1, due_on: addDays(today, 1), last_card_id: null, reviews: 0, lapses: 0 }
  write(MEM_KEY, mem)
}

// Урок модуля пройден гостем: если это урок-слово (строго между Стартом и
// Финалом, название — слово латиницей), слово — в память. lessons — уроки
// модуля по порядку [{ id, title }]
export function seedGuestWordOf(lessons, lessonId) {
  seedGuestWord(lessonWordOf(lessons, lessonId), localDate(new Date()))
}

// Исход повторения гостя: как ответ memory_review_word; пишет и журнал
// (для бюджета дня и итогов недели)
export function reviewGuestWord({ word, outcome, cardId = null, events = null, source = 'review' }, today, rand) {
  const mem = read(MEM_KEY, {})
  const cur = mem[word]
  if (!cur) return { ok: false, reason: 'not_found' }
  const { row, prevStep, applied, settled } = applyReview(cur, outcome, today, rand)
  mem[word] = { ...row, last_card_id: cardId ?? cur.last_card_id }
  write(MEM_KEY, mem)
  const since = addDays(today, -LOG_DAYS)
  const log = read(LOG_KEY, []).filter(r => localDate(r.created_at) >= since)
  log.push({ word, outcome, source, step_before: prevStep, step_after: row.step, applied, events, created_at: new Date().toISOString() })
  write(LOG_KEY, log)
  return { ok: true, word, prev_step: prevStep, step: row.step, due_on: row.due_on, applied, settled, settled_on: row.settled_on }
}

// Журнал гостя за последние N дней — как listRecentReviews
export function listGuestReviews(days, today) {
  const since = addDays(today, -(days - 1))
  return read(LOG_KEY, []).filter(r => localDate(r.created_at) >= since)
}

// ── Тест-инструменты админа в режиме «новенький» (песочница localStorage): те же действия, что серверные
// memory_debug_* (миграции 20260925200000, 20261001140000, 20261002130000), над локальной памятью и журналом.
// Раньше админские кнопки шли на сервер, а вкладка «Память» читала песочницу — «прожить день» ничего не менял.
const DAY_MS = 86400000
const shiftLog = (log, ms) => log.map(r => ({ ...r, created_at: new Date(new Date(r.created_at).getTime() - ms).toISOString() }))

// «Прожить» N дней: сроки слов и журнал — назад → число слов
export function debugShiftGuest(days) {
  const mem = read(MEM_KEY, {})
  const keys = Object.keys(mem)
  for (const w of keys) mem[w] = { ...mem[w], due_on: addDays(mem[w].due_on, -days) }
  write(MEM_KEY, mem)
  write(LOG_KEY, shiftLog(read(LOG_KEY, []), days * DAY_MS))
  return keys.length
}

// Слова (words — список ключей; null — все) к повтору сегодня и бюджет дня свободен
// (журнал последних 36 часов — на 2 дня назад) → { ok, words, journal }
export function debugTodayGuest(words, today) {
  const mem = read(MEM_KEY, {})
  let n = 0
  for (const w of Object.keys(mem)) {
    if ((words && !words.includes(w)) || mem[w].due_on <= today) continue
    mem[w] = { ...mem[w], due_on: today }
    n++
  }
  write(MEM_KEY, mem)
  const log = read(LOG_KEY, [])
  const recent = log.filter(r => Date.now() - new Date(r.created_at).getTime() <= 36 * 3600000)
  write(LOG_KEY, [...log.filter(r => !recent.includes(r)), ...shiftLog(recent, 2 * DAY_MS)])
  return { ok: true, words: n, journal: recent.length }
}

// Занести слово «к повтору сегодня»: новое — шаг 1; уже есть — шаг тот же, срок на сегодня
export function debugAddGuest(word, today) {
  if (!word) return { ok: false, reason: 'word' }
  const mem = read(MEM_KEY, {})
  mem[word] = mem[word] ? { ...mem[word], due_on: today } : { word, step: 1, due_on: today, last_card_id: null, reviews: 0, lapses: 0 }
  write(MEM_KEY, mem)
  return { ok: true, word, step: mem[word].step, due_on: today }
}

// Убрать слово из памяти → 1 | 0
export function debugRemoveGuest(word) {
  const mem = read(MEM_KEY, {})
  if (!mem[word]) return 0
  delete mem[word]
  write(MEM_KEY, mem)
  return 1
}

// 'next' — верный повтор в срок: шаг +1 (на шаге 5 — в постоянную память); 'reset' — как новое, к повтору сегодня.
// Журнал не пишется. Ответ — как у memory_debug_step
export function debugStepGuest(word, action, today) {
  const mem = read(MEM_KEY, {})
  const m = mem[word]
  if (!m) return { ok: false, reason: 'not_found' }
  if (action === 'reset') {
    mem[word] = { ...m, step: 1, due_on: today, settled_on: null, reviews: 0, lapses: 0 }
    write(MEM_KEY, mem)
    return { ok: true, word, prev_step: m.step, step: 1, due_on: today, settled: false, end: false }
  }
  if (action !== 'next') return { ok: false, reason: 'action' }
  if (m.settled_on) return { ok: true, word, prev_step: m.step, step: m.step, due_on: m.due_on, settled: true, end: true }
  const settle = m.step >= 5
  const step = settle ? 5 : m.step + 1
  const due = settle ? addDays(today, 60) : addDays(today, intervalFor(step))
  mem[word] = { ...m, step, due_on: due, settled_on: settle ? today : null, reviews: (m.reviews ?? 0) + 1 }
  write(MEM_KEY, mem)
  return { ok: true, word, prev_step: m.step, step, due_on: due, settled: settle, end: false }
}

// Закреплённые фразы гостя (в аккаунте — таблица phrase_memory). Запись — строка-id
// модуля (так было раньше) или { module_id, consolidated_at, phrase_title, phrase_words }:
// снимок названия и слов нужен, чтобы показать фразу, даже если модуль потом убрали
const PHRASE_KEY = 'pithy_guest_phrases_v1'
const phraseRow = p => (typeof p === 'string' ? { module_id: p, consolidated_at: null, phrase_title: null, phrase_words: null } : p)
export const getGuestPhraseRows = () => read(PHRASE_KEY, []).map(phraseRow).filter(r => r?.module_id)
// snap — { title, words } на момент закрепления; уже закреплённую фразу не перезаписываем
export function addGuestPhrase(id, snap = {}) {
  const rows = getGuestPhraseRows()
  if (rows.some(r => r.module_id === id)) return
  write(PHRASE_KEY, [...rows, {
    module_id: id, consolidated_at: new Date().toISOString(),
    phrase_title: snap.title ?? null, phrase_words: Array.isArray(snap.words) ? snap.words : null,
  }])
}

// «Сколько минут в день» гостя (в аккаунте — user_profiles.daily_minutes)
const MIN_KEY = 'pithy_guest_minutes_v1'
export const getGuestMinutes = () => read(MIN_KEY, 5)
export const setGuestMinutes = m => write(MIN_KEY, m)

export function clearGuestMemory() {
  try { localStorage.removeItem(MEM_KEY); localStorage.removeItem(LOG_KEY); localStorage.removeItem(PHRASE_KEY) } catch { /* нечего чистить */ }
}
