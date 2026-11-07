// Маска слов круга 2 «Скажи» этапа «Фразы» (CONCEPT_PHRASES.md, «Лента и круги»): слова фразы спрятаны до первой буквы с многоточием («Nice to meet you» → «N… to m… y…»)
// и проявляются по мере речи: черновик слушателя — слово бледно (draft), подтверждение — полностью (full). Чистые функции без DOM; на экран маску кладёт racePhraseMaskView.js.
// Правила: короткое слово (≤ SHORT_MAX букв, апостроф не считается: «I'm», «to», «a») видно целиком сразу — прятать его бессмысленно; у длинного видна первая буква («don't» → «d…»);
// знаки по краям («you?», «"Hi») остаются на месте. Номер слова — как у phraseWords (racePhraseData.js) и слушателя: токены без букв и цифр номера не получают и видны всегда.
export const SHORT_MAX = 2
export const DOTS = '…'

const EDGE = /^([^\p{L}\p{N}']*)(.*?)([^\p{L}\p{N}']*)$/u
const letters = core => core.replace(/'/g, '').length

/** Одно слово под маской: «meet» → «m…», «you?» → «y…?», «I'm» → «I'm» (короткое) */
export function maskWord(token) {
  const [, lead, core, tail] = String(token ?? '').match(EDGE) ?? ['', '', '', '']
  if (!core || letters(core) <= SHORT_MAX) return String(token ?? '')
  return `${lead}${core[0]}${DOTS}${tail}`
}

/**
 * Фраза под маской: [{ text, state, index }] по токенам текста (через пробел). heard — Map номер слова → подтверждено ли (true — full, false — draft); all — показать всё (итог хода).
 * state: 'hidden' (маска), 'draft' (слово бледно), 'full' (слово целиком; короткие и токены без букв — всегда full).
 */
export function maskPhrase(text, heard = new Map(), all = false) {
  let n = 0
  return String(text ?? '').trim().split(/\s+/).filter(Boolean).map(token => {
    const core = token.match(EDGE)?.[2] ?? ''
    const index = core ? n++ : -1
    if (!core || all || letters(core) <= SHORT_MAX || heard.get(index) === true) return { text: token, state: 'full', index }
    if (heard.has(index)) return { text: token, state: 'draft', index }
    return { text: maskWord(token), state: 'hidden', index }
  })
}

/** Маска строкой (журнал, тесты, стенд): «N… to m… y…» */
export const maskLine = (text, heard, all) => maskPhrase(text, heard, all).map(w => w.text).join(' ')
