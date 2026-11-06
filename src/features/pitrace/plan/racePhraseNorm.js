// Нормализация plan.phrases (этап 2 «Фразы» игры «Встряхни память», контракт — CONCEPT_RACE.md → «Данные: план из памяти»): что угодно → [{ id, text, key, words: [{ text, translation, level }], ru, own, level, audio }] ≤ 6.
// Вызывает normalizePlan (rehearsalPlan.js) для плана с game: 'race'. Фраза без текста отбрасывается, повторы (по key) схлопываются. Чистые функции.
import { normText } from '../../player/modules/rotate-phone/wordLaneRecipe.js'

export const MAX_PHRASES = 6
export const MAX_PHRASE_WORDS = 12

const clean = (v, n) => String(v ?? '').trim().slice(0, n)
const lvl = (v, d) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Math.min(4, Math.max(0, Math.floor(Number(v)))) : d)

function normalizeWords(list) {
  const seen = new Set()
  const out = []
  for (const w of Array.isArray(list) ? list : []) {
    const text = clean(typeof w === 'string' ? w : w?.text, 80)
    const k = normText(text)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push({ text, translation: clean(w?.translation, 80), level: lvl(w?.level, 0) })
    if (out.length >= MAX_PHRASE_WORDS) break
  }
  return out
}

function normalizeAudio(a) {
  if (!a || typeof a.url !== 'string' || !a.url) return null
  return { url: a.url, duration: Number(a.duration) > 0 ? Number(a.duration) : null }
}

/** Одна фраза или null (нет текста) */
export function normalizePhrase(raw) {
  const text = clean(raw?.text, 120)
  const key = normText(raw?.key || text)
  if (!text || !key) return null
  const words = normalizeWords(raw?.words)
  return {
    id: clean(raw?.id, 80) || `plan:${key}`, text, key, words,
    ru: clean(raw?.ru, 160), own: !!raw?.own,
    level: lvl(raw?.level, words.length ? Math.min(...words.map(w => w.level)) : 0),
    audio: normalizeAudio(raw?.audio),
  }
}

/** Список фраз: не массив — [], без повторов по key, ≤ MAX_PHRASES */
export function normalizePhrases(list) {
  const seen = new Set()
  return (Array.isArray(list) ? list : []).map(normalizePhrase).filter(p => p && !seen.has(p.key) && seen.add(p.key)).slice(0, MAX_PHRASES)
}
