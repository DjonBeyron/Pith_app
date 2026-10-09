// Закрытые словари Vosk для усложнённого теста и описание шагов/пар. Чистые функции без React.
// Стиль «Фразы целиком»: словарь = верная фраза + фразы с ошибочными формами (+ [unk]). Стиль «По словам»: словарь = все слова этих фраз
// по отдельности (+ [unk]) — движок выбирает слова из списка, но порядок свободный.
import { tokenize } from '../../../shared/lib/speech/speechMatch.js'
import { wrongFormsOfWord } from './antiPredictModes.js'
import { DEFAULT_REFS, wrongPhrase } from './contextSeries.js'

export const UNK = '[unk]'
export const STYLES = ['phrases', 'words']
export const STYLE_LABEL = { phrases: 'Фразы целиком', words: 'По словам' }
export const CTX_WORD = 'trying'
export const CTX_SAY = 'try' // что говорим с ошибкой

export const PAIR_PRESETS = [
  { id: 'goes', label: 'go / goes', ok: 'He goes to school', bad: 'He go to school' },
  { id: 'has', label: 'has / have', ok: 'She has a cat', bad: 'She have a cat' },
  { id: 'are', label: 'am / is / are', ok: 'They are happy', bad: 'They is happy' },
  { id: 'ed', label: 'play / played', ok: 'I played tennis yesterday', bad: 'I play tennis yesterday' },
  { id: 'cats', label: 'cat / cats', ok: 'I have two cats', bad: 'I have two cat' },
]

const clean = s => String(s ?? '').toLowerCase().replace(/[‘’‛ʼ´`]/g, "'").replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim()
const uniq = a => [...new Set(a.filter(Boolean))]

/** Словарь Vosk (JSON-массив) для верной фразы и ошибочных фраз в выбранном стиле; в конце всегда [unk] */
export function buildGrammar(style, correct, wrongs = []) {
  const phrases = [correct, ...wrongs]
  if (style === 'words') return JSON.stringify([...uniq(phrases.flatMap(p => [...clean(p).split(' '), ...tokenize(p)])), UNK])
  return JSON.stringify([...uniq(phrases.flatMap(p => [clean(p), tokenize(p).join(' ')])), UNK])
}

/** Слова словаря (без [unk]) — то, что движку разрешено выдать */
export function grammarWords(json) {
  let list
  try { list = JSON.parse(json) } catch { list = [] }
  return uniq((Array.isArray(list) ? list : []).flatMap(p => String(p).split(' ')).filter(w => w !== UNK))
}

/** Ключевые слова пары фраз: где «верно» и «ошибка» различаются («He goes…» / «He go…» → goes / go). Длины равны — первое отличие по позиции */
export function diffKeys(ok, bad) {
  const a = clean(ok).split(' ').filter(Boolean)
  const b = clean(bad).split(' ').filter(Boolean)
  if (a.length === b.length) {
    const i = a.findIndex((w, k) => w !== b[k])
    if (i >= 0) return { okKey: a[i], badKey: b[i] }
  }
  return { okKey: a.find(w => !b.includes(w)) ?? a[0] ?? '', badKey: b.find(w => !a.includes(w)) ?? b[0] ?? '' }
}

/** Шаг A (контекст): i = 0…3, mode 'error' | 'control' */
export function ctxSpec(i, mode, style) {
  const ref = DEFAULT_REFS[i]
  const forms = wrongFormsOfWord(CTX_WORD) // try, tried, tries
  const wrongs = forms.map(f => wrongPhrase(ref, CTX_WORD, f))
  const control = mode === 'control'
  return {
    kind: 'ctx', mode, step: i, tag: `Шаг ${i + 1}`, correct: ref, said: control ? ref : wrongPhrase(ref, CTX_WORD, CTX_SAY),
    grammar: buildGrammar(style, ref, wrongs), keys: { say: control ? CTX_WORD : CTX_SAY, ok: CTX_WORD, bad: forms },
  }
}

/** Пара C: pair = { id, label, ok, bad } (ok — верная фраза, bad — с ошибкой) */
export function pairSpec(pair, mode, style) {
  const { okKey, badKey } = diffKeys(pair.ok, pair.bad)
  const control = mode === 'control'
  return {
    kind: 'pair', mode, step: pair.id, tag: pair.label, correct: pair.ok, said: control ? pair.ok : pair.bad,
    grammar: buildGrammar(style, pair.ok, [pair.bad]), keys: { say: control ? okKey : badKey, ok: okKey, bad: [badKey] },
  }
}
