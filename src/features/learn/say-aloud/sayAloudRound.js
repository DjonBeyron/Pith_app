// Раунд мини-игры «Скажи вслух»: какие слова берём и что считать итогом. Чистые функции, без React и сети.
// Слова — из лестницы «Памяти» (view.ladder, learnView.js): ближайший срок повтора (due) первым. Нужен перевод (его показывает Пит) и латиница, которую Vosk умеет распознавать;
// слова без перевода или с цифрами/чужими буквами в раунд не попадают (их нечем показать или нечем проверить).
import { isVoskPhrase } from '../../../shared/lib/vosk/sayVoskGrammar.js'
import { plural } from '../../../shared/lib/plural.js'

export const ROUND_MAX = 8      // слов в раунде не больше (60–90 с)
export const ROUND_MIN = 5      // желаемый минимум для раунда по умолчанию
export const MIN_TO_SHOW = 3    // кнопка «Скажи вслух» видна, когда в памяти есть хотя бы столько подходящих слов

const hasTranslation = w => !!String(w?.translation ?? '').trim()
const playable = w => !!w?.word && hasTranslation(w) && isVoskPhrase(w.word)

/** Все слова лестницы одним списком: три ступени + постоянная память */
export function ladderWords(view) {
  const l = view?.ladder
  if (!l) return []
  return [...(l.levels ?? []).flatMap(x => x.words ?? []), ...(l.permanent ?? [])]
}

/** Слова из списка [{ word, translation, due, step }], годные для игры (есть перевод, латиница), без повторов */
export function playableFrom(words) {
  const seen = new Set()
  return (words ?? []).filter(w => playable(w) && !seen.has(w.word) && seen.add(w.word))
}

/** Слова лестницы, годные для игры */
export const playableWords = view => playableFrom(ladderWords(view))

// Ближайший срок первым; без срока — в конец; при равных сроках — менее прочное слово (меньший шаг), потом по алфавиту
const byDue = (a, b) => (a.due ? 0 : 1) - (b.due ? 0 : 1) || String(a.due ?? '').localeCompare(String(b.due ?? '')) || (a.step ?? 0) - (b.step ?? 0) || a.word.localeCompare(b.word)

// Раунд из подходящих слов: withWord первым, остальные — ближайший срок первым; меньше min — пусто
function roundFrom(all, { max, min, withWord }) {
  if (all.length < min) return []
  const first = withWord ? all.find(w => w.word === withWord) : null
  const rest = all.filter(w => w !== first).sort(byDue)
  return [...(first ? [first] : []), ...rest].slice(0, max).map(w => ({ word: w.word, translation: String(w.translation).trim() }))
}

/**
 * Слова раунда: [{ word, translation }]. withWord (ключ слова из окна слова) идёт первым, если оно годится. Меньше min подходящих слов — пустой список (раунда нет).
 */
export function pickRoundWords(view, { max = ROUND_MAX, min = ROUND_MIN, withWord = null } = {}) {
  return roundFrom(playableWords(view), { max, min, withWord })
}

/** То же из готового списка [{ word, translation, due, step }] — итог повторения, где лестницы (view) нет */
export function pickRoundFromWords(words, { max = ROUND_MAX, min = MIN_TO_SHOW } = {}) {
  return roundFrom(playableFrom(words), { max, min, withWord: null })
}

/** Хватает ли в списке слов на раунд (итог повторения) */
export const canSayAloudWords = words => playableFrom(words).length >= MIN_TO_SHOW

/** Можно ли предложить игру: хватает слов, а если запуск из окна слова — оно само годится для игры */
export function canSayAloud(view, withWord = null) {
  const all = playableWords(view)
  return all.length >= MIN_TO_SHOW && (!withWord || all.some(w => w.word === withWord))
}

/** answers — [{ word, translation, ok }] по порядку заданных слов → { hits, misses, words, items }. Слова, до которых не дошли, в ответы не входят */
export function roundResult(answers) {
  const items = (answers ?? []).map(a => ({ word: a.word, translation: a.translation ?? '', ok: !!a.ok }))
  const hits = items.filter(a => a.ok).length
  return { hits, misses: items.length - hits, words: items.length, items }
}

/** Заголовок итога: «Пит нашёл 3 слова» */
export const resultTitle = hits => `Пит нашёл ${hits} ${plural(hits, 'слово', 'слова', 'слов')}`
