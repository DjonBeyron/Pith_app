// Текст → форма рта (коды Rhubarb): общая часть для кота в «Повороте телефона» (features/player/modules/rotate-phone/wordLaneVisemes.js)
// и для Пита сцен v2 (features/scene/v2/mouthVisemes.js). Чистые функции без DOM. Русские слова — по буквам (таблица MAP); английские — по СОЧЕТАНИЯМ букв (visemeEnglish.js:
// ear → округлый рот, oo → трубочка, th → язык, немое e в конце не звучит; дифтонг = две формы подряд), чтобы «learn» читалось «лёрн», а не C→D→B.
// Коды: A — губы сомкнуты (м б п), B — зубы рядом (согласные, и), C — полуоткрыт (е э), D — широко (а я), E — округлён (о),
// F — «трубочка» (у ю w), G — зубы на губе (ф в), H — язык (л), X — рот закрыт.
import { englishShapes } from './visemeEnglish.js'

const MAP = {
  a: 'D', 'а': 'D', 'я': 'D',
  e: 'C', 'э': 'C', 'е': 'C',
  i: 'C', 'и': 'B', 'ы': 'B', y: 'B', // английское i чаще /aɪ/ или /ɪ/ (like, nice, it) — полуоткрытый рот, а не «зубы рядом»
  o: 'E', 'о': 'E', 'ё': 'E',
  u: 'F', 'у': 'F', 'ю': 'F', w: 'F',
  m: 'A', b: 'A', p: 'A', 'м': 'A', 'б': 'A', 'п': 'A',
  f: 'G', v: 'G', 'ф': 'G', 'в': 'G',
  l: 'H', 'л': 'H',
}
const VOWELS = /[aeiouyаеёиоуыэюя]/i
const CYRILLIC = /[а-яё]/i
export const LETTER = /[a-zа-яё]/i
const CONSONANT_W = 0.4 // согласные короче: гласные держат рот открытым дольше (по стенду ?scene=cmp при 0.55 рот сидел в «зубах»)

/** Форма рта для буквы (нет буквы — null) */
export const codeOf = ch => (LETTER.test(ch) ? MAP[ch.toLowerCase()] ?? 'B' : null)

/** Вес буквы по длительности: гласные звучат дольше согласных */
export const letterWeight = ch => (VOWELS.test(ch) ? 1 : CONSONANT_W)

const single = ch => ({ code: codeOf(ch), w: letterWeight(ch) })

/**
 * Формы рта слова по порядку: [{ code, w }] — w доля длительности (гласные и дифтонги дольше согласных). Английское слово — по сочетаниям букв (visemeEnglish.js), слово с русскими буквами — по одной.
 * code === null — буква не звучит (немое e, начальное «y»): wordSegments отдаёт её время соседней форме.
 */
export function wordShapes(word) {
  const letters = [...String(word ?? '')].filter(ch => LETTER.test(ch)).map(ch => ch.toLowerCase())
  if (!letters.length) return []
  return letters.some(ch => CYRILLIC.test(ch)) ? letters.map(single) : englishShapes(letters.join(''), single)
}

/** Общий вес слова (сумма весов его форм) — чтобы раскладывать слова по времени пропорционально (wordLaneVisemes.mouthTrack) */
export const wordWeight = word => wordShapes(word).reduce((a, s) => a + s.w, 0)

// Беззвучные буквы отдают вес последней гласной перед ними (немое e в «home» — «о»; гласная — форма с весом от VOWEL_W, согласные легче), нет гласной — предыдущей форме, а в начале слова — следующей
const VOWEL_W = 0.75
function foldSilent(shapes) {
  const out = []
  let carry = 0
  for (const s of shapes) {
    if (s.code) { out.push({ code: s.code, w: s.w + carry }); carry = 0; continue }
    const vowel = [...out].reverse().find(x => x.w >= VOWEL_W) ?? out.at(-1)
    if (vowel) vowel.w += s.w
    else carry += s.w
  }
  return out
}

/** Отрезки { at, end, code } слова word на [from, to): формы с весами, подряд идущие одинаковые склеены (единицы времени — как у from/to) */
export function wordSegments(word, from, to) {
  const shapes = foldSilent(wordShapes(word))
  if (!shapes.length || to <= from) return []
  const total = shapes.reduce((a, s) => a + s.w, 0)
  const out = []
  let at = from
  for (const { code, w } of shapes) {
    const end = at + ((to - from) * w) / total
    const last = out.at(-1)
    if (last && last.code === code) last.end = end
    else out.push({ at, end, code })
    at = end
  }
  return out
}
