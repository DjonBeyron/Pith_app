import { reviewOutcome } from '../../shared/lib/memory/reviewOutcome.js'

// «Помнишь?» в ленте (PROJECT.md → «Лента»): одна карточка повтора раз в
// 6–8 видео, не больше 3 в день, никогда подряд, только если есть что
// повторять сегодня (остаток бюджета дня, не «Отпуск»). Засчитывается в
// дневной потолок (source 'feed'); пролистал — без штрафа.
const KEY = 'pithy_feed_remember_v1'
export const REMEMBER_PER_DAY = 3

export const nextGap = (rand = Math.random) => 6 + Math.floor(rand() * 3) // 6..8

export function shownToday(today) {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return s?.date === today ? s.count : 0
  } catch { return 0 }
}

export function markShown(today) {
  try { localStorage.setItem(KEY, JSON.stringify({ date: today, count: shownToday(today) + 1 })) } catch { /* приватный режим */ }
}

// Слово для «Помнишь?» — первое из выбора дня (самое слабое); нечего — null
export function pickRememberWord(view) {
  if (!view || view.vacation) return null
  return view.today?.picked?.[0]?.word ?? null
}

export const shouldOffer = ({ swipes, gap, shown, word }) =>
  !!word && swipes >= gap && shown < REMEMBER_PER_DAY

// Исход одной карточки в ленте: второй попытки тут нет, поэтому ошибка —
// again (−1), а не fail (−2), как было бы в сессии без исправления
export function feedOutcome(res, cardId) {
  if (res.result === 'know') return 'know'
  if (res.result === 'wrong') return 'again'
  return reviewOutcome([{ cardId, result: 'correct', timeMs: res.timeMs }])
}
