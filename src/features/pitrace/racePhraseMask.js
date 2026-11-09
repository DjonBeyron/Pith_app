// Маска слов круга 2 «Скажи» этапа «Фразы» (CONCEPT_PHRASES.md, «Лента и круги»), вариант «кирпичики» (выбор владельца 2026-11-07): спрятанное слово — ровная плашка
// по длине слова без букв (текст — фигурные пробелы U+2007, по одному на букву; плашку рисует race-phrase-rounds.css), «Nice to meet you» → «Nice ▭▭ ▭▭▭▭ ▭▭▭».
// Слова проявляются по мере речи: черновик слушателя — слово бледно (draft), подтверждение — целиком (full). Чистые функции без DOM; на экран маску кладёт racePhraseMaskView.js.
// Что открыто сразу (правила владельца): первое слово всегда; короткое слово (≤ SHORT_MAX букв, апостроф не считается: «to», «a», «I'm»), если оно не сразу за другим открытым
// словом (значит, второе слово фразы — никогда) и открытых коротких в фразе ещё меньше трёх. Знаки по краям («you?», «"Hi») остаются на месте.
// ПОДСКАЗКА СЛЕДУЮЩЕГО СЛОВА (решение владельца 2026-11-09): сказано слово k — слово k+1 из кирпичика становится текстом в состоянии 'peek' и проявляется ЦЕЛЫМ словом до 20 %
// (opacity по --peek, ведёт сцена: racePhrasePeek.js); сказано — 'full'. peek — только у спрятанного слова и только в проходе 1. nextPeek — какое слово подсказывать (строго следующее за сказанным).
// Номер слова — как у phraseWords (racePhraseData.js) и слушателя: токены без букв и цифр номера не получают и видны всегда.
export const SHORT_MAX = 2
export const SHORT_OPEN_MAX = 3
export const BRICK = ' '

const EDGE = /^([^\p{L}\p{N}']*)(.*?)([^\p{L}\p{N}']*)$/u
const letters = core => core.replace(/'/g, '').length

/** Одно слово плашкой: «meet» → «▭▭▭▭» (четыре фигурных пробела), «you?» → «▭▭▭?», «—» → «—» */
export function maskWord(token) {
  const [, lead, core, tail] = String(token ?? '').match(EDGE) ?? ['', '', '', '']
  if (!core) return String(token ?? '')
  return `${lead}${BRICK.repeat(letters(core))}${tail}`
}

/** Номера слов, открытых сразу (без речи): первое и короткие по правилам выше */
export function openWords(text) {
  const open = new Set()
  let n = 0, shorts = 0, prevOpen = false
  for (const token of String(text ?? '').trim().split(/\s+/)) {
    const core = token.match(EDGE)?.[2] ?? ''
    if (!core) continue
    const index = n++
    const show = index === 0 || (letters(core) <= SHORT_MAX && !prevOpen && shorts < SHORT_OPEN_MAX)
    if (show && index) shorts++
    if (show) open.add(index)
    prevOpen = show
  }
  return open
}

/**
 * Фраза под маской: [{ text, state, index }] по токенам текста (через пробел). heard — Map номер слова → подтверждено ли (true — full, false — draft); all — показать всё (итог хода).
 * state: 'hidden' (плашка), 'peek' (подсказка: текст слова, проявляется целым словом до 20 % — только спрятанное слово с номером peek), 'draft' (слово бледно), 'full' (слово целиком; открытые сразу и токены без букв — всегда full).
 */
export function maskPhrase(text, heard = new Map(), all = false, peek = -1) {
  const open = openWords(text)
  let n = 0
  return String(text ?? '').trim().split(/\s+/).filter(Boolean).map(token => {
    const core = token.match(EDGE)?.[2] ?? ''
    const index = core ? n++ : -1
    if (!core || all || open.has(index) || heard.get(index) === true) return { text: token, state: 'full', index }
    if (heard.has(index)) return { text: token, state: 'draft', index }
    if (index === peek) return { text: token, state: 'peek', index }
    return { text: maskWord(token), state: 'hidden', index }
  })
}

/** Маска строкой (журнал, тесты, стенд): плашки показаны как «▭» на букву — «Nice ▭▭ ▭▭▭▭ ▭▭▭» */
export const maskLine = (text, heard, all) => maskPhrase(text, heard, all).map(w => w.text.replaceAll(BRICK, '▭')).join(' ')

/** Какое слово подсказывать (peek): строго следующее за самым дальним сказанным, если оно спрятано (не открыто сразу и не услышано). Ничего не сказано или следующее открыто / его нет — -1 */
export function nextPeek(text, heard = new Map()) {
  if (!heard.size) return -1
  const open = openWords(text), n = maskPhrase(text).filter(w => w.index >= 0).length
  const i = Math.max(...heard.keys()) + 1
  return i < n && !open.has(i) && !heard.has(i) ? i : -1
}
