// Английское слово → последовательность форм рта по СОЧЕТАНИЯМ букв (а не по одной букве). Побуквенная раскладка давала на «learn» C→D→B: рот не круглился, хотя звучит «лёрн».
// Здесь сначала ищутся сочетания (самые длинные первыми: ear, igh, ing → ee, oo, ou, th, sh …), потом условные правила (немое e в конце, «магическое» e: nice, make; y; ou после y), потом одиночные буквы.
// Чистая функция без DOM: форма рта — коды Rhubarb (A — губы сомкнуты, B — зубы рядом, C — полуоткрыт, D — широко, E — округлён, F — «трубочка», G — зуб на губе, H — язык),
// вес w — доля длительности (гласные и дифтонги дольше согласных). code === null — буква не произносится (немое e, начальное y): её вес отдаётся соседней форме (см. visemeLetters.wordSegments).
// Общая с кодом сцен v2 (scene/v2/mouthVisemes.js) через shared/lib/visemeLetters.js.
const VOWEL = /[aeiouy]/
const isV = ch => VOWEL.test(ch ?? '')
const isC = ch => !!ch && /[a-z]/.test(ch) && !isV(ch)

const S = (code, w) => ({ code, w })
const ER = [S('E', 1), S('B', 0.4)]            // ear er ir ur or: округлый /ɜː/ /ɔː/ и лёгкое «р»
const DIPH_E = [S('C', 0.8), S('B', 0.6)]      // ai ay ei ey: /eɪ/
const DIPH_AI = [S('D', 0.9), S('B', 0.6)]     // igh, i_e, y: /aɪ/
const DIPH_OU = [S('E', 0.8), S('F', 0.8)]     // ou ow: /aʊ/ /oʊ/ — округляется и вытягивается трубочкой
const DIPH_OI = [S('E', 0.8), S('B', 0.6)]     // oi oy: /ɔɪ/

// Сочетания: ключ → формы по порядку. Три буквы сверху, потом две
export const DIGRAPHS = {
  ear: ER, igh: DIPH_AI, ing: [S('B', 0.9)],
  er: ER, ir: ER, ur: ER, or: ER,
  oo: [S('F', 1.4)], ou: DIPH_OU, ow: DIPH_OU, ew: [S('F', 1.2)], ue: [S('F', 1.2)],
  oa: [S('E', 1.3)], aw: [S('E', 1.3)], au: [S('E', 1.3)],
  ai: DIPH_E, ay: DIPH_E, ei: DIPH_E, ey: DIPH_E, oi: DIPH_OI, oy: DIPH_OI,
  ee: [S('B', 1.1)], ea: [S('C', 1)], ie: [S('B', 1)],
  th: [S('H', 0.5)], sh: [S('B', 0.5)], ch: [S('B', 0.5)], wh: [S('F', 0.5)], qu: [S('F', 0.5)], ng: [S('B', 0.5)], ck: [S('B', 0.5)], ph: [S('G', 0.5)], wr: [S('B', 0.4)],
}
const MAX_LEN = 3

// Слова целиком, где побуквенный разбор врёт: «I» и «I'm» (апостроф отброшен → «im») — /aɪ/
const WORDS = { i: DIPH_AI, im: [...DIPH_AI, S('A', 0.4)] }

const NO_MAGIC = new Set(['are', 'have', 'give', 'live', 'were']) // здесь a/i + согласная + e читается коротко, дифтонга нет

/** Магическое e: гласная a / i / y + одна согласная + немое e на конце (make, nice, type, fire) → дифтонг; для остальных гласных (home, use) подходит обычная форма */
function magic(w, i) {
  const n = w.length
  if (!(i + 2 === n - 1 && w[n - 1] === 'e' && isC(w[i + 1])) || NO_MAGIC.has(w)) return null
  if (w[i] === 'a') return DIPH_E
  return w[i] === 'i' || w[i] === 'y' ? DIPH_AI : null
}

/** Условные правила для одиночной буквы i (после проверки сочетаний): y и немое e. null — обычная форма буквы */
function special(w, i) {
  const ch = w[i]
  const n = w.length
  if (ch === 'y') {
    if (i === 0 && isV(w[1])) return [S(null, 0.25)]                                    // yes, you: «й» не рот, а переход к гласной
    if (i === n - 1) return /^[^aeiou]*y$/.test(w) ? DIPH_AI : [S('B', 0.8)]             // my, try, fly → /aɪ/; really, happy → /i/
    if (w[i + 1] === 'i') return DIPH_AI                                                 // trying, flying
    return null
  }
  if (ch === 'e' && i === n - 1 && n >= 3 && !isV(w[i - 1]) && /[aeiouy]/.test(w.slice(0, i))) return [S(null, 0.4)] // немое e: nice, home, make — время отдаётся гласной
  return null
}

/** Сочетание на позиции i: { shapes, len } или null. w — слово строчными латинскими */
function digraphAt(w, i) {
  if (w[i] === 'o' && w[i + 1] === 'u') {
    if (i === 1 && w[0] === 'y') return { shapes: [S('F', 1.3)], len: 2 }               // you, your: /juː/
    if (w[i + 2] === 'l' && w[i + 3] === 'd') return { shapes: [S('F', 1.1)], len: 2 }  // would, could, should: /ʊ/
  }
  if (w[i] === 'a' && w[i + 1] === 'l' && 'lkstw'.includes(w[i + 2] ?? '-')) return { shapes: [S('E', 1.3)], len: 2 } // all, talk, salt, also
  for (let len = Math.min(MAX_LEN, w.length - i); len >= 2; len--) {
    const shapes = DIGRAPHS[w.slice(i, i + len)]
    if (shapes) return { shapes, len }
  }
  return null
}

const copy = list => list.map(s => ({ ...s }))

/**
 * Формы рта английского слова: w — только буквы, строчные. single(ch) → { code, w } — форма одиночной буквы (таблица в visemeLetters.js).
 * Возвращает [{ code, w }] (code может быть null — буква не звучит).
 */
export function englishShapes(w, single) {
  if (WORDS[w]) return copy(WORDS[w])
  const out = []
  let i = 0
  while (i < w.length) {
    const ch = w[i]
    if (isC(ch) && w[i + 1] === ch) { i += 1; continue }                      // удвоенная согласная звучит как одна (ff, ll, tt)
    const m = magic(w, i)
    if (m) { out.push(...copy(m)); i += 1; continue }                         // nice, make, fire: гласная + согласная + немое e
    const d = digraphAt(w, i)
    if (d) { out.push(...copy(d.shapes)); i += d.len; continue }
    const sp = special(w, i)
    if (sp) out.push(...copy(sp))
    else out.push(single(ch))
    i += 1
  }
  return out
}
