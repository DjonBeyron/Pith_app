import { localDate } from './dailyPick.js'
import { wordKey } from '../wordAudio/wordKey.js'

// Память повторения ГОСТЯ — в localStorage (PROJECT.md → «Онбординг»: память
// гостя локальная, при регистрации переносится — RPC memory_import_guest).
// Правила шагов — зеркало серверной memory_review_word (миграция
// 20260924120000_word_memory.sql): меняешь одно — меняй другое.
//   good / know → шаг +1 (на шаге 5 — остаётся, поддержка 60 дней)
//   hard        → шаг тот же, интервал текущего шага
//   again / fail→ шаг −1 / −2, завтра
//   верный ответ раньше срока шаг не двигает (applied = false)
//   от 7 дней — разброс ±1 день
const MEM_KEY = 'pithy_guest_memory_v1'
const LOG_KEY = 'pithy_guest_reviews_v1'
const LOG_DAYS = 30

export const intervalFor = step => ({ 1: 1, 2: 3, 3: 7, 4: 16 })[step] ?? 35

export function addDays(date, n) {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + n)
  return localDate(d)
}

// Чистое ядро: строка памяти + исход → { row, prevStep, applied }
export function applyReview(row, outcome, today, rand = Math.random) {
  let step = row.step
  let due = row.due_on
  let applied = true
  if (outcome === 'again' || outcome === 'fail') {
    step = Math.max(1, row.step - (outcome === 'fail' ? 2 : 1))
    due = addDays(today, 1)
  } else if (row.due_on > today) {
    applied = false
  } else {
    let days
    if (outcome === 'hard') days = intervalFor(row.step)
    else if (row.step >= 5) { step = 5; days = 60 }
    else { step = row.step + 1; days = intervalFor(step) }
    if (days >= 7) days += Math.floor(rand() * 3) - 1
    due = addDays(today, days)
  }
  return {
    prevStep: row.step,
    applied,
    row: {
      ...row, step, due_on: due,
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

// [{ word, step, due_on, last_card_id, reviews, lapses }] — как строки word_memory
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
  const i = (lessons ?? []).findIndex(l => l.id === lessonId)
  if (i <= 0 || i >= lessons.length - 1) return
  seedGuestWord(wordKey(lessons[i].title), localDate(new Date()))
}

// Исход повторения гостя: как ответ memory_review_word; пишет и журнал
// (для бюджета дня и итогов недели)
export function reviewGuestWord({ word, outcome, cardId = null, events = null, source = 'review' }, today, rand) {
  const mem = read(MEM_KEY, {})
  const cur = mem[word]
  if (!cur) return { ok: false, reason: 'not_found' }
  const { row, prevStep, applied } = applyReview(cur, outcome, today, rand)
  mem[word] = { ...row, last_card_id: cardId ?? cur.last_card_id }
  write(MEM_KEY, mem)
  const since = addDays(today, -LOG_DAYS)
  const log = read(LOG_KEY, []).filter(r => localDate(r.created_at) >= since)
  log.push({ word, outcome, source, step_before: prevStep, step_after: row.step, applied, events, created_at: new Date().toISOString() })
  write(LOG_KEY, log)
  return { ok: true, word, prev_step: prevStep, step: row.step, due_on: row.due_on, applied }
}

// Журнал гостя за последние N дней — как listRecentReviews
export function listGuestReviews(days, today) {
  const since = addDays(today, -(days - 1))
  return read(LOG_KEY, []).filter(r => localDate(r.created_at) >= since)
}

export function clearGuestMemory() {
  try { localStorage.removeItem(MEM_KEY); localStorage.removeItem(LOG_KEY) } catch { /* нечего чистить */ }
}
