// Шаблон свободной фразы для «Сказать фразу» (поле pattern ноды): вместо одной фразы-эталона автор описывает, КАКАЯ фраза годится.
// Чистые функции, без React. Синтаксис (регистр и знаки препинания не важны, «I'm» и «I am» одно и то же — tokenize из speechMatch.js):
//   слова            I try to          — должны прозвучать именно эти слова подряд
//   (a|b|c d)        (try|am trying)   — любой один из вариантов (вариант может быть из нескольких слов)
//   (a|b)?           (yes|yeah)?       — то же, но вариант можно пропустить
//   *                I try to *        — ровно одно любое слово
//   **               I try to **       — одно или несколько любых слов (то, что ученик придумал сам)
// Пример: «I (try|am trying) to **» засчитает «I try to wake up early» и «I'm trying to relax», но не «I tried to relax».
// Сравнение слов — как в обычной проверке: допуск опечаток по длине слова (tolerance), в режиме «Строго» — точное совпадение.
import { tokenize, levenshtein, tolerance } from './speechMatch.js'

/** Разобрать шаблон. @returns {{ok: boolean, error?: string, elements: object[]}} elements: lit {tokens} | alt {options, optional} | any | many */
export function parsePattern(src) {
  const text = String(src ?? '').trim()
  if (!text) return { ok: false, error: 'пусто', elements: [] }
  const re = /\(([^()]*)\)(\?)?|\*\*|\*|[^\s()*?|]+|(\s+)|([()?|])/g
  const elements = []
  let m
  while ((m = re.exec(text))) {
    if (m[3]) continue // пробелы
    if (m[4]) return { ok: false, error: `лишний знак «${m[4]}»`, elements: [] }
    if (m[1] != null) {
      const options = m[1].split('|').map(o => tokenize(o)).filter(t => t.length)
      if (!options.length) return { ok: false, error: 'пустая группа ( )', elements: [] }
      elements.push({ kind: 'alt', options, optional: m[2] === '?' })
    } else if (m[0] === '**') elements.push({ kind: 'many' })
    else if (m[0] === '*') elements.push({ kind: 'any' })
    else {
      const tokens = tokenize(m[0])
      const last = elements[elements.length - 1]
      if (!tokens.length) continue
      if (last?.kind === 'lit') last.tokens.push(...tokens)
      else elements.push({ kind: 'lit', tokens })
    }
  }
  if (!elements.length) return { ok: false, error: 'нет слов', elements: [] }
  if (elements.every(e => e.kind === 'any' || e.kind === 'many' || (e.kind === 'alt' && e.optional))) return { ok: false, error: 'нужно хотя бы одно обязательное слово', elements: [] }
  return { ok: true, elements }
}

const sameWord = (heard, want, exact) => heard === want || (!exact && levenshtein(heard, want) <= tolerance(want.length))

/** Совпал ли весь услышанный текст с шаблоном целиком (с возвратом: ** и необязательные группы пробуют все варианты) */
function fullMatch(elements, hyp, exact) {
  const seen = new Set()
  function go(ei, pos) {
    const key = ei * 1000 + pos
    if (seen.has(key)) return false
    seen.add(key)
    if (ei === elements.length) return pos === hyp.length
    const el = elements[ei]
    if (el.kind === 'lit') {
      if (pos + el.tokens.length > hyp.length) return false
      return el.tokens.every((t, k) => sameWord(hyp[pos + k], t, exact)) && go(ei + 1, pos + el.tokens.length)
    }
    if (el.kind === 'any') return pos < hyp.length && go(ei + 1, pos + 1)
    if (el.kind === 'many') {
      for (let n = 1; pos + n <= hyp.length; n++) if (go(ei + 1, pos + n)) return true
      return false
    }
    for (const opt of el.options) {
      if (pos + opt.length <= hyp.length && opt.every((t, k) => sameWord(hyp[pos + k], t, exact)) && go(ei + 1, pos + opt.length)) return true
    }
    return el.optional ? go(ei + 1, pos) : false
  }
  return go(0, 0)
}

/** Обязательные слова шаблона (для подсказки «почти»): слова lit и первый вариант каждой обязательной группы */
export function requiredWords(elements) {
  return elements.flatMap(e => (e.kind === 'lit' ? e.tokens : e.kind === 'alt' && !e.optional ? e.options[0] : []))
}

/**
 * Сравнить услышанное с шаблоном. passed — весь текст подошёл целиком; ratio — доля обязательных слов шаблона, найденных в тексте
 * по порядку (для подсказки «почти получилось»: matched / missed — слова шаблона). Совместимо по полям с matchPhrase.
 * @returns {{passed: boolean, ratio: number, matched: string[], missed: string[], extra: string[], items: object[], pattern: true}}
 */
export function matchPattern(pattern, heard, { exact = false } = {}) {
  const parsed = parsePattern(pattern)
  const hyp = tokenize(heard)
  if (!parsed.ok) return { passed: false, ratio: 0, matched: [], missed: [], extra: hyp, items: [], pattern: true }
  const passed = fullMatch(parsed.elements, hyp, exact)
  const need = requiredWords(parsed.elements)
  // Жадно по порядку: сколько обязательных слов встретилось в услышанном (слова для «Почти! Верно: … Не хватило: …»)
  let from = 0
  const items = need.map(word => {
    let at = -1
    for (let j = from; j < hyp.length; j++) if (sameWord(hyp[j], word, exact)) { at = j; break }
    if (at >= 0) from = at + 1
    return { word, ok: at >= 0, heard: at >= 0 ? hyp[at] : null }
  })
  const matched = items.filter(i => i.ok).map(i => i.word)
  const missed = items.filter(i => !i.ok).map(i => i.word)
  return { passed, ratio: passed ? 1 : need.length ? matched.length / need.length : 0, matched, missed, extra: [], items, pattern: true }
}
