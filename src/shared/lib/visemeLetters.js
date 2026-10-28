// Буква → форма рта (коды Rhubarb): общая часть для кота в «Повороте телефона» (features/player/modules/rotate-phone/wordLaneVisemes.js)
// и для Пита сцен v2 (features/scene/v2/mouthVisemes.js). Чистые функции без DOM.
// Коды: A — губы сомкнуты (м б п), B — зубы рядом (согласные, и), C — полуоткрыт (е э), D — широко (а я), E — округлён (о),
// F — «трубочка» (у ю w), G — зубы на губе (ф в), H — язык (л), X — рот закрыт.
const MAP = {
  a: 'D', 'а': 'D', 'я': 'D',
  e: 'C', 'э': 'C', 'е': 'C',
  i: 'B', 'и': 'B', 'ы': 'B', y: 'B',
  o: 'E', 'о': 'E', 'ё': 'E',
  u: 'F', 'у': 'F', 'ю': 'F', w: 'F',
  m: 'A', b: 'A', p: 'A', 'м': 'A', 'б': 'A', 'п': 'A',
  f: 'G', v: 'G', 'ф': 'G', 'в': 'G',
  l: 'H', 'л': 'H',
}
const VOWELS = /[aeiouyаеёиоуыэюя]/i
export const LETTER = /[a-zа-яё]/i
const CONSONANT_W = 0.55

/** Форма рта для буквы (нет буквы — null) */
export const codeOf = ch => (LETTER.test(ch) ? MAP[ch.toLowerCase()] ?? 'B' : null)

/** Вес буквы по длительности: гласные звучат дольше согласных */
export const letterWeight = ch => (VOWELS.test(ch) ? 1 : CONSONANT_W)

/** Отрезки { at, end, code } слова word на [from, to): буквы с весами, подряд идущие одинаковые формы склеены (единицы времени — как у from/to) */
export function wordSegments(word, from, to) {
  const letters = [...word].filter(ch => LETTER.test(ch))
  if (!letters.length || to <= from) return []
  const total = letters.reduce((a, ch) => a + letterWeight(ch), 0)
  const out = []
  let at = from
  for (const ch of letters) {
    const end = at + ((to - from) * letterWeight(ch)) / total
    const code = codeOf(ch)
    const last = out.at(-1)
    if (last && last.code === code) last.end = end
    else out.push({ at, end, code })
    at = end
  }
  return out
}
