// Какие слова повторять сегодня — чистая функция без сети.
//
// Правила (PROJECT.md → «Система повторения»): берём только созревшие слова
// (due_on ≤ today); сначала слабые (меньше шаг), среди равных — дольше всех
// ждущие; слабому слову (шаг 1–2) — 2 карточки, крепкому — 1; сумма карточек
// не больше бюджета дня. Не влезшее НЕ копится долгом: завтра выбор делается
// заново по тем же правилам, счётчика «просрочено» нет нигде.

// Бюджет карточек в день по ответу «Сколько минут в день?»
// (user_profiles.daily_minutes)
export const CARDS_BY_MINUTES = { 5: 8, 10: 14, 15: 20 }

export function dailyCardBudget(minutes) {
  return CARDS_BY_MINUTES[minutes] ?? CARDS_BY_MINUTES[5]
}

export function cardsForStep(step) {
  return step <= 2 ? 2 : 1
}

// memory: строки word_memory [{ word, step, due_on: 'YYYY-MM-DD' }]
// today:  'YYYY-MM-DD' (локальная дата устройства)
// budget: сколько карточек ещё можно показать сегодня
// canReview(word): есть ли у слова колода (слово без колоды — не в расписании)
// → [{ word, step, cards }]
export function pickToday(memory, { today, budget, canReview = () => true }) {
  const due = (memory ?? [])
    .filter(m => m.due_on <= today && canReview(m.word))
    .sort((a, b) =>
      a.step - b.step ||
      a.due_on.localeCompare(b.due_on) ||
      a.word.localeCompare(b.word))

  const picked = []
  let left = budget
  for (const m of due) {
    if (left <= 0) break
    const cards = Math.min(cardsForStep(m.step), left)
    picked.push({ word: m.word, step: m.step, cards })
    left -= cards
  }
  return picked
}

// Сколько карточек уже показано сегодня (бюджет дня — на все сессии дня):
// reviews — журнал review_events; сегодняшние по дате устройства — сессии
// повторения и «Помнишь?» в ленте (source 'review' | 'feed'); карточка —
// уникальный cardId в ответах строки (возврат после ошибки — та же карточка)
export function cardsShownToday(reviews, today) {
  let n = 0
  for (const r of reviews ?? []) {
    if ((r.source !== 'review' && r.source !== 'feed') || localDate(r.created_at) !== today) continue
    const ids = new Set((Array.isArray(r.events) ? r.events : []).map(e => e?.cardId))
    n += Math.max(1, ids.size)
  }
  return n
}

// 'YYYY-MM-DD' по часам устройства
export function localDate(ts) {
  const d = new Date(ts)
  const p = x => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
