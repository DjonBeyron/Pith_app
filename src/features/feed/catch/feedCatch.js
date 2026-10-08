import { splitTitleTokens } from '../../../shared/lib/titleWords.js'
import { wordKey } from '../../../shared/lib/wordAudio/wordKey.js'

// «Ловля слов» в ленте (спек: задание «напечатай слова фразы, которые расслышал»).
// Чистые функции без React: уровень слова по памяти, слова фразы, когда ставить задание,
// какой сигнал уйдёт в память, лимиты показа (как у «Помнишь?» в feedRecall.js, свой ключ).
const KEY = 'pithy_feed_catch_v1'
export const CATCH_PER_DAY = 3
export const CATCH_GAP = 5 // не чаще раза в 5 видео

// Уровень слова 0..4 по памяти пользователя: knowledge = { stepOf, settledOf } (useFeedKnowledge)
// 0 — слова нет в памяти, 1 — шаг 1–2, 2 — шаг 3–4, 3 — шаг 5, 4 — постоянная память
export function wordLevel(text, knowledge) {
  if (!knowledge) return 0
  const key = wordKey(text)
  if (!key) return 0
  if (knowledge.settledOf?.has(key)) return 4
  const step = knowledge.stepOf?.get(key)
  if (step >= 5) return 3
  if (step >= 3) return 2
  if (step >= 1) return 1
  return 0
}

// Слова фразы (без знаков препинания): [{ index, text, key, level }]
export function catchWords(title, knowledge) {
  return splitTitleTokens(title)
    .filter(t => t.word)
    .map(t => ({ index: t.index, text: t.text, key: wordKey(t.text), level: wordLevel(t.text, knowledge) }))
}

// Ставим задание: оно включено у модуля, на слайде нет «Помнишь?» (recallIndex === -1) и есть свои слова (уровень ≥2)
export function catchEligible(words, { enabled = true, recallIndex = -1 } = {}) {
  return Boolean(enabled) && recallIndex === -1 && words.some(w => w.level >= 2)
}

// Сколько во фразе «своих» слов — это число в чипе «Здесь N твоих слов»
export const catchOwnCount = words => words.filter(w => w.level >= 2).length

// Сигнал в память за набранное слово: свои слова (≥2) — «услышано» без помощи, «не расслышал» с помощью
export const catchSignal = (level, helped) => (level < 2 ? null : helped ? 'help' : 'heard')

// Класс цвета слова по уровню (feed-knowledge.css): 0 — белое, 4 — фиолетовое (P)
export const LEVEL_CLASS = level => (level === 0 ? '' : level === 4 ? 'fwKnown fwKnown--P' : `fwKnown fwKnown--${level}`)

// ── Лимиты показа: сколько раз за день уже предложили ──────────────────
export function shownCatchToday(today) {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return s?.date === today ? s.count : 0
  } catch { return 0 }
}

export function markCatchShown(today) {
  try { localStorage.setItem(KEY, JSON.stringify({ date: today, count: shownCatchToday(today) + 1 })) } catch { /* приватный режим */ }
}

// Можно ли предложить сейчас: прошло ≥ 5 видео с прошлого раза и дневной лимит не выбран
export const canOfferCatch = ({ swipes, shown }) => swipes >= CATCH_GAP && shown < CATCH_PER_DAY
