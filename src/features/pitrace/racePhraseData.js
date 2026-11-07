// Фразы этапа 2 «Фразы» игры «Встряхни память» из плана (контракт этапа 2): plan.phrases = [{ id, text, key, words: [{ text, translation, level }], ru, scene, own, level, audio }] строит слой данных,
// движок их только читает и проверяет здесь (пустые и повторы выбрасываются, недостающее достраивается из текста). Плана с фразами ещё нет, а план — симуляция (source 'sim': фикстура админки, стенд) —
// фразы из фикстуры racePhraseFixture.js, чтобы этап можно было проверить до слоя данных. Слова фразы для слушателя и сегментов заливки — токены текста (phraseTokens), для учёта точности — ещё и words. Чистые функции.
import { normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'

export const PHRASES_MIN = 3 // меньше трёх фраз — этапа нет: на ходу круга 1 три кандидата
export const PHRASES_MAX = 6

const clean = t => String(t ?? '').trim()

const edge = t => t.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '')
/** Слова фразы как написаны (без знаков по краям): «I'm trying to learn» → ["I'm", 'trying', 'to', 'learn'] — сегменты заливки широкой пилюли */
export const phraseWords = text => clean(text).split(/\s+/).map(edge).filter(Boolean)
/** Они же строчными — слова фразы для слушателя (createPhraseListener: phrases[].words); номер слова = номер сегмента */
export const phraseTokens = text => phraseWords(text).map(t => t.toLowerCase())

/** Одна фраза плана в виде, с которым работает движок; негодная — null */
export function normalizePhrase(p) {
  const text = clean(p?.text)
  if (!text) return null
  const words = (Array.isArray(p.words) ? p.words : []).map(x => (typeof x === 'string' ? { text: x } : x)).filter(x => clean(x?.text))
    .map(x => ({ text: clean(x.text), translation: clean(x.translation), level: Number.isFinite(x.level) ? x.level : 1 }))
  return {
    id: clean(p.id) || normText(text), text, key: clean(p.key) || normText(text), words, ru: clean(p.ru), scene: clean(p.scene), own: p.own !== false,
    level: Number.isFinite(p.level) ? p.level : 1, audio: p.audio?.url ? { url: p.audio.url, duration: Number(p.audio.duration) || 0 } : null,
  }
}

/** Фразы плана без повторов (по key), не больше PHRASES_MAX; у плана-симуляции без фраз — фикстура */
export function phrasesOf(plan) {
  const raw = Array.isArray(plan?.phrases) && plan.phrases.length ? plan.phrases : plan?.source === 'sim' ? PHRASE_FIXTURE : []
  const seen = new Set()
  return raw.map(normalizePhrase).filter(p => p && !seen.has(p.key) && seen.add(p.key)).slice(0, PHRASES_MAX)
}

/** Есть ли этап фраз: не меньше PHRASES_MIN фраз и хотя бы одна своя (дежурные целью не бывают) */
export const hasPhrases = list => list.length >= PHRASES_MIN && list.some(p => p.own)

/** Слова фразы для учёта точности: токены текста и слова из плана (words), без повторов, в виде ключей normText */
export const phraseWordKeys = p => [...new Set([...phraseWords(p?.text), ...(p?.words ?? []).map(w => w.text ?? w)].map(normText).filter(Boolean))]

/** Тексты для библиотеки слов (Пит читает фразу по словам, когда целой озвучки нет) */
export const phraseTexts = plan => phrasesOf(plan).flatMap(p => phraseWords(p.text))

/** Смыслы фраз по-русски (озвучка word_audio по transKey, как переводы слов) */
export const phraseMeanings = plan => phrasesOf(plan).map(p => p.ru).filter(Boolean)

/** Ситуации фраз для круга 1 (озвучка та же: word_audio по transKey) */
export const phraseScenes = plan => phrasesOf(plan).map(p => p.scene).filter(Boolean)

/** План после normalizePlan (rehearsalCfg.js): пока нормализатор плана не знает фраз, plan.phrases из исходного плана переносятся как есть (их проверяет phrasesOf); фразы уже есть — план не трогаем */
export const withPhrases = (plan, raw) => (plan?.game === 'race' && !plan.phrases?.length && Array.isArray(raw?.phrases) ? { ...plan, phrases: raw.phrases } : plan) // normalizePlan даёт phrases: [] — пустой список тоже «нет фраз» (v3.3.141)
