// План репетиции (RehearsalPlan, CONCEPT_REHEARSAL.md §4): что репетируем в одной сессии. Поставщик плана — planFor(source) (rehearsalFixtures.js): сейчас фикстура, потом память слов и фраз, потом нода.
// Сценарий от источника не зависит. Чистые функции — проверяются тестами.
//   { phrase: 'I'm | trying | to learn', translation, lang, chunks: ['I'm','trying','to learn'],
//     words: [{ text, translation, due, lapses, confusers: [≤2 слова-двойника] }],
//     seed: 'строка семени случайностей внутри актов (rehearsalSeed.js; нет в JSON — «дата|фраза»)', stressed: [номера ударных кусков, пока вручную], audio: { phrase: { url, timings } | null, words: 'lib' }, source: 'sim' | 'memory' | 'node' }
import { parsePhrase, normText, MAX_CONFUSERS } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { SLOT_COUNT } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { ONLY_IDS } from './rehearsalOnly.js'
import { cleanSeed, seedFor } from './rehearsalSeed.js'

export const SOURCES = ['sim', 'memory', 'node']
export const MAX_PLAN_WORDS = 8
export const MAX_WARMUP = 3        // слов «к повтору» в разминке
export const MAX_DISCERN = 2       // слов в акте «Различи»

const clean = v => String(v ?? '').trim().slice(0, 80)

function normalizeWord(raw) {
  const text = clean(raw?.text)
  if (!text) return null
  const seen = new Set([normText(text)])
  const confusers = []
  for (const c of Array.isArray(raw?.confusers) ? raw.confusers : []) {
    const w = clean(c)
    const key = normText(w)
    if (!key || seen.has(key)) continue
    seen.add(key); confusers.push(w)
    if (confusers.length >= MAX_CONFUSERS) break
  }
  return { text, translation: clean(raw?.translation), due: !!raw?.due, lapses: Math.max(0, Math.floor(Number(raw?.lapses) || 0)), confusers }
}

/** Что угодно (JSON из админки, фикстура) → план или null, если нет ни одного куска. Куски: chunks или phrase через «|» (до трёх) */
export function normalizePlan(raw) {
  if (!raw || typeof raw !== 'object') return null
  const fromChunks = Array.isArray(raw.chunks) ? raw.chunks.map(clean).filter(Boolean).slice(0, SLOT_COUNT) : []
  const chunks = fromChunks.length ? fromChunks : parsePhrase(raw.phrase)
  if (!chunks.length) return null
  const words = (Array.isArray(raw.words) ? raw.words : []).map(normalizeWord).filter(Boolean).slice(0, MAX_PLAN_WORDS)
  const stressed = [...new Set((Array.isArray(raw.stressed) ? raw.stressed : []).map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < chunks.length))]
  const phrase = raw.audio?.phrase
  return {
    phrase: chunks.join(' | '),
    seed: cleanSeed(raw.seed) ?? seedFor(chunks.join(' | ')), // случайность внутри актов (CONCEPT_REHEARSAL.md §8): одно семя — одна сессия; нет в JSON — от даты и фразы
    translation: clean(raw.translation),
    lang: clean(raw.lang) || 'en-US',
    chunks,
    words,
    stressed,
    audio: { phrase: phrase && typeof phrase.url === 'string' && phrase.url ? { url: phrase.url, timings: Array.isArray(phrase.timings) ? phrase.timings : [] } : null, words: 'lib' },
    source: SOURCES.includes(raw.source) ? raw.source : 'node',
    ...(ONLY_IDS.includes(raw.only) ? { only: raw.only } : {}), // «Шлифовка репетиции»: играть только этот этап (rehearsalOnly.js)
  }
}

/** Слова куска (по пробелам, без знаков по краям) */
export const wordsOfChunk = chunk => String(chunk ?? '').split(/\s+/).map(w => w.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '')).filter(Boolean)

/** В каком куске слово: по токенам, потом по вхождению; −1 — слова во фразе нет */
export function laneOfWord(chunks, text) {
  const key = normText(text)
  if (!key) return -1
  const i = chunks.findIndex(c => normText(c).split(' ').includes(key))
  return i >= 0 ? i : chunks.findIndex(c => normText(c).includes(key))
}

const same = (a, b) => normText(a) === normText(b)

/**
 * Слова разминки (акт 1): 2–3 слова «к повтору»; нет таких (или одно) — добираем любыми словами плана, потом словами фразы (без перевода). У каждого — дорожка (lane): кусок, в котором оно стоит.
 * Одно слово во фразе — одна дорожка по центру.
 */
export function warmupWords(plan) {
  const n = plan.chunks.length
  const picked = plan.words.filter(w => w.due).slice(0, MAX_WARMUP)
  const want = n === 1 ? 1 : 2
  const rest = plan.words.filter(w => !picked.includes(w))
  while (picked.length < want && rest.length) picked.push(rest.shift())
  if (picked.length < want) {
    const tokens = plan.chunks.flatMap(wordsOfChunk).filter(w => normText(w).length >= 3)
    for (const t of [...tokens.slice(Math.floor(tokens.length / 2)), ...tokens]) {
      if (picked.length >= want) break
      if (!picked.some(p => same(p.text, t))) picked.push({ text: t, translation: '', due: false, lapses: 0, confusers: [] })
    }
  }
  return picked.map((w, i) => {
    const at = laneOfWord(plan.chunks, w.text)
    return { ...w, lane: n === 1 ? 1 : at >= 0 ? at : i % n }
  })
}

/** Слова акта «Различи»: те, у кого есть двойники (до MAX_DISCERN) */
export const discernWords = plan => plan.words.filter(w => w.confusers.length).slice(0, MAX_DISCERN).map(w => ({ ...w, lane: laneOfWord(plan.chunks, w.text) }))

/** Тексты, которые должна озвучить библиотека слов: куски, слова плана, двойники, слова фразы */
export function planTexts(plan) {
  const out = [...plan.chunks, ...plan.words.map(w => w.text), ...plan.words.flatMap(w => w.confusers), ...plan.chunks.flatMap(wordsOfChunk)]
  const seen = new Set()
  return out.filter(t => { const k = normText(t); if (!k || seen.has(k)) return false; seen.add(k); return true })
}
