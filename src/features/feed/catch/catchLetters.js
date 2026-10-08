import { cleanExtraLetters, keyboardModel, litChars } from '../../../shared/lib/typeWordKeys.js'

// «Ловля слов» в ленте: сколько букв-«запутывателей» (светятся, но их нет в слове) на клавиатуре
// зависит от силы слова в памяти (уровень 0..4, см. feedCatch.js → wordLevel).
// Чистые функции без React: запутыватели выбираются детерминированно (по хэшу слова),
// чтобы клавиатура одного слова не «прыгала» при каждой перерисовке.

// Сколько запутывателей на уровне: [мин, макс]; 'all' — вся клавиатура живая
export const LURE_COUNT = { 0: [0, 0], 1: [1, 1], 2: [2, 3], 3: [4, 5], 4: 'all' }

// Похожие по звучанию/написанию буквы латиницы — запутывают в первую очередь
export const SIMILAR = {
  b: 'pd', d: 'bt', t: 'd', v: 'fw', f: 'v', w: 'v', c: 'ks', k: 'cg', g: 'kj', s: 'cz', z: 's',
  i: 'ey', e: 'ia', a: 'eo', o: 'au', u: 'o', m: 'n', n: 'm', l: 'r', r: 'l', j: 'gy', y: 'ij',
  h: '', q: 'k', x: 's',
}

// Простой стабильный хэш строки (djb2), всегда неотрицательный
function hashOf(text) {
  let h = 5381
  for (const ch of text) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0
  return h
}

// Детерминированный «шафл» остатка алфавита: сдвиг по хэшу + шаг, взаимно простой с длиной
function pickFrom(pool, n, seed) {
  const out = []
  const len = pool.length
  if (!len || n <= 0) return out
  let step = (seed % len) + 1
  while (gcd(step, len) !== 1) step++
  let pos = seed % len
  for (let i = 0; i < Math.min(n, len); i++) {
    out.push(pool[pos])
    pos = (pos + step) % len
  }
  return out
}

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b)
}

// Все буквы раскладки слова
const alphabetOf = word => keyboardModel(word).rows.flat().map(k => k.ch)

// Запутыватели слова на этом уровне — строка букв БЕЗ букв слова и без повторов
export function lureLetters(word, level, authorExtra = '') {
  const range = LURE_COUNT[level]
  if (!range || level === 0) return ''
  const own = litChars(word)
  const alphabet = alphabetOf(word)
  if (range === 'all') return alphabet.filter(ch => !own.has(ch)).join('')

  // Автор задал буквы сам — это и есть ответ
  const author = cleanExtraLetters(authorExtra)
  if (author) return [...author].filter(ch => !own.has(ch)).join('')

  const hash = hashOf([...own].join('') + String(word).toLowerCase())
  const [min, max] = range
  const count = min + (hash % (max - min + 1))
  const picked = []
  const take = ch => {
    if (picked.length < count && !own.has(ch) && !picked.includes(ch) && alphabet.includes(ch)) picked.push(ch)
  }
  // Сначала похожие на буквы слова — в порядке букв слова
  for (const ch of [...String(word).toLowerCase()]) for (const s of SIMILAR[ch] ?? '') take(s)
  // Потом добираем из алфавита раскладки
  const rest = alphabet.filter(ch => !own.has(ch) && !picked.includes(ch))
  for (const ch of pickFrom(rest, count - picked.length, hash)) take(ch)
  return picked.join('')
}

// Модель клавиатуры слова с запутывателями нужного уровня
export function catchKeyboard(word, level, authorExtra = '') {
  return keyboardModel(word, lureLetters(word, level, authorExtra))
}

