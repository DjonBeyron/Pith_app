// Выбор цели стенда пилюль по сиду (CONCEPT_PILLSTAND.md): случайность только rngFor / rngInt (rehearsalSeed.js) — та же сессия (сид, язык, режим, длина, номер цели) повторяется точь-в-точь.
// Режим 'word' — вертикальная пилюля слова (проход A / B «Пинг-понга»), 'words' — фраза по словам (проход 1 «Скажи»), 'fast' — фраза быстро (проход 2). Язык 'en' — говорят по-английски, на пилюле
// перевод (у вертикальной) или сама фраза; 'ru' — говорят по-русски. Длина: 'short' — слово до 6 букв / фраза до 3 слов, 'long' — длиннее, 'any' — все. Чистые функции.
import { rngFor, rngInt } from '../rehearsal/rehearsalSeed.js'
import { STAND_WORDS, STAND_PHRASES } from './pillStandData.js'

export const MODES = ['word', 'words', 'fast']
export const LANGS = ['en', 'ru']
export const LENS = ['short', 'long', 'any']
export const WORD_SHORT_MAX = 6
export const PHRASE_SHORT_MAX = 3

const count = text => String(text ?? '').trim().split(/\s+/).filter(Boolean).length
const letters = text => String(text ?? '').replace(/[^\p{L}]/gu, '').length

/** Короткая ли цель: слово — по буквам сказанного, фраза — по словам сказанного */
export const isShort = (mode, say) => (mode === 'word' ? letters(say) <= WORD_SHORT_MAX : count(say) <= PHRASE_SHORT_MAX)

/** Все кандидаты режима и языка: [{ say, shown }] — say говорят, shown видно на пилюле (у фраз — та же фраза) */
export function candidates(mode, lang) {
  if (mode === 'word') return STAND_WORDS.map(w => (lang === 'ru' ? { say: w.ru, shown: w.en } : { say: w.en, shown: w.ru }))
  return STAND_PHRASES.map(p => { const say = lang === 'ru' ? p.ru : p.en; return { say, shown: say, other: lang === 'ru' ? p.en : p.ru } })
}

/** Кандидаты с фильтром длины (пусто — без фильтра, чтобы стенд не встал) */
export function pool(mode, lang, len = 'any') {
  const all = candidates(mode, lang)
  const fit = len === 'any' ? all : all.filter(c => isShort(mode, c.say) === (len === 'short'))
  return fit.length ? fit : all
}

const rawIndex = (seed, mode, lang, len, n, size) => rngInt(rngFor(String(seed), `pillstand|${mode}|${lang}|${len}|${n}`), size)

/** Номер кандидата цели n: случайный по сиду, а совпал с прошлой целью — следующий по списку (подряд одна и та же не выпадает; цепочка считается от цели 0 — зависит только от сида и настроек) */
export function targetIndex({ seed, n, mode, lang, len, size }) {
  let prev = -1, i = 0
  for (let k = 0; k <= n; k++) { i = rawIndex(seed, mode, lang, len, k, size); if (size > 1 && i === prev) i = (i + 1) % size; prev = i }
  return i
}

/** Цель номер n сессии: { n, mode, lang, len, seed, say, shown, words } — words — сколько слов говорить */
export function pickTarget({ seed, n = 0, mode = 'word', lang = 'en', len = 'any' }) {
  const list = pool(mode, lang, len)
  const c = list[targetIndex({ seed, n, mode, lang, len, size: list.length })]
  return { n, mode, lang, len, seed: String(seed), say: c.say, shown: c.shown, ...(c.other ? { other: c.other } : {}), words: count(c.say) }
}
