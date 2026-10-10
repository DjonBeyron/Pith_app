// Цифры → английские слова для модуля «Сказать фразу» (чистые функции, без React): Vosk выдаёт числа только словами («two», «twenty five»), системное распознавание — то цифрами, то словами.
// Поддерживаем только ПРОСТОЕ: целые 0–9999 («2», «25», «100», «1,000»), порядковые («1st», «21st»), годы 1100–2099 (читаются двумя способами), проценты («5%»), валюту («$5», «£5», «€5»), время («3:30»).
// Всё остальное с цифрами (десятичные «2.5», числа от 10000, телефоны «555-1234», «5-year», «3:30 pm») — НЕ простое: такая фраза остаётся на системном распознавании как раньше.
// У числа может быть несколько допустимых прочтений (год: «nineteen ninety eight» / «one thousand nine hundred ninety eight»; «0»: «zero» / «oh»; «105»: с «and» и без) — первое прочтение основное.
// foldNumbers — основное прочтение для сравнения (tokenize в speechMatch.js: эталон «2» и услышанное «two» становятся одним словом); readingsOfText — все прочтения фразы (грамматика Vosk, выбор эталона при оценке).
export const MAX_READINGS = 8       // прочтений всей фразы (произведение прочтений её чисел)
const MAX_PER_NUMBER = 4

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const ORD = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' }
const MONEY = { $: ['dollar', 'dollars'], '£': ['pound', 'pounds'], '€': ['euro', 'euros'] }
const uniq = a => [...new Set(a.filter(Boolean))]

const below100 = n => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : ''))

/** 0..9999 словами; withAnd — британское «one hundred and five» */
export function cardinalWords(n, withAnd = false) {
  if (n === 0) return 'zero'
  const th = Math.floor(n / 1000), h = Math.floor((n % 1000) / 100), tail = n % 100
  const parts = []
  if (th) parts.push(`${ONES[th]} thousand`)
  if (h) parts.push(`${ONES[h]} hundred`)
  if (tail) { if (withAnd && (th || h)) parts.push('and'); parts.push(below100(tail)) }
  return parts.join(' ')
}

/** Порядковое: 1 → first, 21 → twenty first, 100 → one hundredth */
export function ordinalWords(n) {
  const w = cardinalWords(n).split(' ')
  const last = w.pop()
  w.push(ORD[last] ?? (last.endsWith('y') ? `${last.slice(0, -1)}ieth` : `${last}th`))
  return w.join(' ')
}

const cardinalReadings = n => uniq([cardinalWords(n), cardinalWords(n, true), n === 0 ? 'oh' : ''])

// Год «голыми» четырьмя цифрами: парой («nineteen ninety eight») и числом («one thousand nine hundred ninety eight»); 2000–2009 — основное «two thousand five»
function yearReadings(n) {
  const a = Math.floor(n / 100), b = n % 100
  const card = cardinalReadings(n)
  if (n >= 2000 && n <= 2009) return uniq([...card, b ? `twenty oh ${ONES[b]}` : ''])
  const pair = b === 0 ? `${below100(a)} hundred` : b < 10 ? `${below100(a)} oh ${ONES[b]}` : `${below100(a)} ${below100(b)}`
  return uniq([pair, ...card])
}

function timeReadings(h, m) {
  const hw = cardinalWords(h)
  if (m === 0) return [`${hw} o'clock`, hw]
  if (m < 10) return [`${hw} oh ${ONES[m]}`, `${hw} zero ${ONES[m]}`]
  return [`${hw} ${below100(m)}`]
}

// Целое из записи: «25», «1,000»; ведущие нули («05»), запятые не по тысячам и числа больше 9999 — не простое (null)
function intOf(s) {
  if (!/^(\d{1,4}|\d{1,3}(,\d{3})+)$/.test(s)) return null
  if (s.length > 1 && s[0] === '0') return null
  const n = Number(s.replace(/,/g, ''))
  return n <= 9999 ? n : null
}

// Прочтения «ядра» слова без знаков вокруг: массив строк (основное первым) либо null — не простое число
function parseCore(core) {
  let m
  if (/^\d{4}$/.test(core) && core[0] !== '0') { const n = Number(core); return (n >= 1100 && n <= 2099 ? yearReadings(n) : cardinalReadings(n)).slice(0, MAX_PER_NUMBER) }
  if (/^[\d,]+$/.test(core)) { const n = intOf(core); return n == null ? null : cardinalReadings(n).slice(0, MAX_PER_NUMBER) }
  if ((m = /^([\d,]+)(?:st|nd|rd|th)$/i.exec(core))) { const n = intOf(m[1]); return n == null ? null : [ordinalWords(n)] }
  if ((m = /^([\d,]+)%$/.exec(core))) { const n = intOf(m[1]); return n == null ? null : cardinalReadings(n).slice(0, 2).map(w => `${w} percent`) }
  if ((m = /^([$£€])([\d,]+)$/.exec(core))) { const n = intOf(m[2]); return n == null ? null : cardinalReadings(n).slice(0, 2).map(w => `${w} ${MONEY[m[1]][n === 1 ? 0 : 1]}`) }
  if ((m = /^(\d{1,2}):(\d{2})$/.exec(core))) { const h = Number(m[1]), mi = Number(m[2]); return h <= 23 && mi <= 59 ? timeReadings(h, mi) : null }
  return null
}

const WRAP_L = /^[("'“‘[]+/
const WRAP_R = /[)"'”’\].,!?;:…]+$/
const AM_PM = /^[ap]\.?m\.?[.,!?)]*$/i

// Текст → куски: пробелы/слова без чисел как есть, числа — { l, r, rd, raw }: знаки до/после, прочтения (rd = null — не простое число)
function scan(text) {
  const pieces = String(text ?? '').split(/(\s+)/)
  const slots = pieces.map(p => {
    if (!/\d/.test(p)) return p
    const l = WRAP_L.exec(p)?.[0] ?? ''
    const rest = p.slice(l.length)
    const r = WRAP_R.exec(rest)?.[0] ?? ''
    const core = rest.slice(0, rest.length - r.length)
    return { l, r, raw: p, core, rd: parseCore(core) }
  })
  // «3:30 pm» / «5 a.m.» — слова «pm/am» Vosk не знает: такое время не простое
  slots.forEach((s, i) => {
    if (typeof s === 'string' || !s.rd) return
    const next = slots.slice(i + 1).find(x => typeof x !== 'string' || x.trim())
    if (/:/.test(s.core) && typeof next === 'string' && AM_PM.test(next)) s.rd = null
  })
  return slots
}

export const hasDigits = text => /\d/.test(String(text ?? ''))

/** Основное прочтение: все ПРОСТЫЕ числа заменены словами («I have 2 cats.» → «I have two cats.»), остальное как было. Для сравнения эталона и услышанного */
export function foldNumbers(text) {
  const s = String(text ?? '')
  if (!hasDigits(s)) return s
  return scan(s).map(x => (typeof x === 'string' ? x : x.rd ? `${x.l}${x.rd[0]}${x.r}` : x.raw)).join('')
}

// Наборы индексов прочтений по возрастанию числа «неосновных» выборов (сначала основное прочтение везде), не больше max
function combos(sizes, max) {
  const out = [sizes.map(() => 0)]
  const seen = new Set([out[0].join()])
  for (let i = 0; i < out.length && out.length < max; i++) {
    for (let p = 0; p < sizes.length && out.length < max; p++) {
      for (let v = 0; v < sizes[p] && out.length < max; v++) {
        const c = out[i].slice(); c[p] = v
        const key = c.join()
        if (!seen.has(key)) { seen.add(key); out.push(c) }
      }
    }
  }
  return out
}

/** Все прочтения фразы (основное первым, не больше max): [text] без цифр; null — в тексте есть число, которое мы не умеем читать (фраза остаётся на системном) */
export function readingsOfText(text, max = MAX_READINGS) {
  const s = String(text ?? '')
  if (!hasDigits(s)) return [s]
  const slots = scan(s)
  const nums = slots.filter(x => typeof x !== 'string')
  if (nums.some(x => !x.rd)) return null
  return combos(nums.map(x => x.rd.length), max).map(c => {
    let k = 0
    return slots.map(x => (typeof x === 'string' ? x : `${x.l}${x.rd[c[k++]]}${x.r}`)).join('')
  })
}

// Слова, которые появляются из чисел (в ошибочные формы грамматики их не превращаем: «twos» / «fiveing» не нужны)
const NUMBER_SET = (() => {
  const words = ['hundred', 'thousand', 'oh', 'percent', "o'clock", 'oclock', ...Object.values(MONEY).flat()]
  for (let n = 0; n <= 100; n++) words.push(...cardinalWords(n).split(' '), ...ordinalWords(n).split(' '))
  words.push(...ordinalWords(1000).split(' '))
  return new Set(words)
})()
export const isNumberWord = w => NUMBER_SET.has(String(w ?? '').toLowerCase())
