import { wordKey } from '../../shared/lib/wordAudio/wordKey.js'
import { plural } from '../../shared/lib/plural.js'
import { KNOW_STEP } from '../learn/learnView.js'

// Лента и память слов (этап 6 системы повторения, PROJECT.md → «Лента»):
// что во фразе знакомо, метка слайда и порядок рекомендаций. Чистые функции:
// stepOf — Map слово → шаг памяти, lessonWord — Map урок → слово (learnView).

// Слова фразы — уроки-слова модуля (между Стартом и Финалом), без повторов
export function moduleWords(lessonIds, lessonWord) {
  const ids = Array.isArray(lessonIds) && lessonIds.length > 2 ? lessonIds.slice(1, -1) : []
  return [...new Set(ids.map(id => lessonWord?.get(id)).filter(Boolean))]
}

// { total, known (шаг ≥ 3), newWords (не в памяти), shaky (в памяти, шаг < 3) }
export function phraseInfo(words, stepOf) {
  const inMem = words.filter(w => stepOf.has(w))
  return {
    total: words.length,
    known: inMem.filter(w => stepOf.get(w) >= KNOW_STEP).length,
    newWords: words.filter(w => !stepOf.has(w)),
    shaky: inMem.filter(w => stepOf.get(w) < KNOW_STEP),
  }
}

// Метка слайда: «Знаешь 3 из 4 · Закрепит: to» / «Новое для тебя: 1 слово».
// Пока память пуста — без меток (новичку нечего сравнивать)
export function feedChip(info, hasMemory) {
  if (!hasMemory || !info.total) return null
  const parts = []
  if (info.known) parts.push(`Знаешь ${info.known} из ${info.total}`)
  if (info.shaky.length) parts.push(`Закрепит: ${info.shaky.slice(0, 2).join(', ')}`)
  else if (info.newWords.length) {
    const n = info.newWords.length
    parts.push(`Новое для тебя: ${n} ${plural(n, 'слово', 'слова', 'слов')}`)
  }
  return parts.join(' · ') || null
}

// Шаг памяти слова фразы (для подсветки цветом силы) или null
export const tokenStep = (text, stepOf) => stepOf?.get(wordKey(text)) ?? null

// Детерминированный генератор: порядок ленты не прыгает в течение дня
function seeded(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export const daySeed = today => [...today].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

// Порядок рекомендаций по карте памяти (без ML):
//   0 — есть шатающееся слово; 1–2 новых слова при знакомых остальных — вверх
//   1 — прочее
//   2 — фраза без слов-уроков
//   3 — все слова новые — вниз, среди них проще — раньше (голоса сложности)
//   +1 — быстро пролистанная фраза или похожая на неё (общее слово)
// Среди равных — порядок админа. Каждая 6-я позиция — случайная фраза из
// хвоста (чтобы лента не замыкалась на знакомом). Холодный старт (память
// пуста) — порядок админа как есть.
export function rankFeed(modules, { stepOf, lessonWord, skipped = new Set(), seed = 1 } = {}) {
  if (!stepOf?.size || modules.length < 2) return modules
  const skippedWords = new Set(modules.filter(m => skipped.has(m.id)).flatMap(m => moduleWords(m.lessonIds, lessonWord)))
  const scored = modules.map((m, i) => {
    const words = moduleWords(m.lessonIds, lessonWord)
    const info = phraseInfo(words, stepOf)
    let tier = 1
    if (!words.length) tier = 2
    else if (info.newWords.length === words.length) tier = 3
    else if (info.shaky.length || info.newWords.length <= 2) tier = 0
    if (skipped.has(m.id) || words.some(w => skippedWords.has(w))) tier += 1
    // Сложность — медиана голосов 1/2/3 (curricula.difficulty); нет — «легко»
    return { m, i, tier, diff: Number(m.difficulty) || 1 }
  })
  scored.sort((a, b) => a.tier - b.tier || (a.tier >= 3 ? a.diff - b.diff : 0) || a.i - b.i)
  const out = scored.map(s => s.m)
  const rand = seeded(seed)
  for (let pos = 5; pos < out.length - 1; pos += 6) {
    const j = pos + 1 + Math.floor(rand() * (out.length - pos - 1))
    ;[out[pos], out[j]] = [out[j], out[pos]]
  }
  return out
}
