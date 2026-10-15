import { matchTop, tokenize, levenshtein, tolerance, PASS_RATIO } from '../../../shared/lib/speech/speechMatch.js'
import { sayGrammarPhrases, isVoskPhrase } from '../../../shared/lib/vosk/sayVoskGrammar.js'
import { normalizeTask, taskAnswers, VOICE_KINDS } from './sceneTask.js'

// Голосовые виды задания сцены (чистые функции для UI ленты и админки):
//   kind 'repeat' — «Повтори за диктором»: эталон = text реплики (+ accept[])
//   kind 'say'    — «Ответь коту»: эталоны = answers[] + accept[]; keywords[] — ключевые слова
// Решение — по ГЛАВНОМУ варианту распознавания (hyps[0]), как в «Сказать фразу» (matchTop).

export const MAX_TASK_GRAMMAR = 40
const MODE_LABELS = { translate: 'О чём диалог', say: 'Ответь коту', repeat: 'Повтори за диктором' }

export const taskModeLabel = kind => MODE_LABELS[kind] ?? MODE_LABELS.translate
export const taskNeedsMic = task => VOICE_KINDS.includes(normalizeTask(task)?.kind)

// Эталоны для показа после ответа (без повторов)
export const taskExpectedPhrases = (task, line) => taskAnswers(task, line)

// Фразы для закрытого словаря Vosk: эталоны + accept + ключевые слова; только латиница (isVoskPhrase);
// сначала верные фразы, затем ошибочные формы слов (sayGrammarPhrases); без повторов, не больше MAX_TASK_GRAMMAR
export function taskGrammar(task, line) {
  const t = normalizeTask(task)
  if (!t || !VOICE_KINDS.includes(t.kind)) return []
  const refs = [...taskExpectedPhrases(t, line), ...(t.keywords ?? [])].filter(isVoskPhrase)
  const lists = refs.map((phrase, i) => sayGrammarPhrases({ phrase, keywords: i < refs.length - (t.keywords?.length ?? 0) ? t.keywords : [] }, 8))
  const out = []
  const push = p => { if (p && !out.includes(p) && out.length < MAX_TASK_GRAMMAR) out.push(p) }
  lists.forEach(l => push(l[0]))
  const depth = Math.max(0, ...lists.map(l => l.length))
  for (let k = 1; k < depth; k++) lists.forEach(l => push(l[k]))
  return out
}

const cleanHyps = hyps => (Array.isArray(hyps) ? hyps : []).map(h => String(h ?? '').replace(/\[unk\]/gi, ' ').trim())

// Покрытие ключевых слов: слово из нескольких токенов — нужны все; допуск опечаток как в speechMatch
function keywordCoverage(keywords, heard, exact) {
  const hyp = tokenize(heard)
  const has = k => hyp.some(h => levenshtein(k, h) <= (exact ? 0 : tolerance(k.length)))
  const keys = keywords.map(k => ({ k, ok: tokenize(k).length > 0 && tokenize(k).every(has) })).filter(x => tokenize(x.k).length)
  const missing = keys.filter(x => !x.ok).map(x => x.k)
  return { score: keys.length ? (keys.length - missing.length) / keys.length : 0, missing }
}

const EMPTY = { ok: false, score: 0, matched: [], missingKeys: [], best: null, empty: true }

/**
 * Проверка голосового ответа: hyps — варианты распознавания (первый главный).
 * @returns {{ok: boolean, score: number, matched: string[], missingKeys: string[], best: string|null, empty: boolean}}
 *   best — эталон, с которым совпало лучше всего (для показа); missingKeys — чего не хватило
 */
export function checkSpeechAnswer(task, line, hyps) {
  const t = normalizeTask(task)
  const alts = cleanHyps(hyps)
  if (!t || !VOICE_KINDS.includes(t.kind) || !tokenize(alts[0]).length) return { ...EMPTY, best: t ? taskExpectedPhrases(t, line)[0] ?? null : null }
  const ratio = t.passRatio ?? PASS_RATIO
  let top = null
  for (const ref of taskExpectedPhrases(t, line)) {
    const r = matchTop(ref, alts, [], ratio, { exactWords: !!t.strict })
    if (!top || r.ratio > top.ratio || (r.ratio === top.ratio && r.extra.length < top.extra.length)) top = { ...r, ref }
  }
  const byRef = top ? { ok: top.passed, score: top.ratio, matched: top.matched, missingKeys: top.missed, best: top.ref } : null
  if (!t.keywords?.length) return { ...(byRef ?? { ...EMPTY, empty: false }), empty: false }
  const kw = keywordCoverage(t.keywords, alts[0], !!t.strict)
  const kwOk = kw.score >= ratio - 1e-9
  if (byRef && (byRef.ok || byRef.score >= kw.score)) return { ...byRef, ok: byRef.ok || kwOk, empty: false }
  return { ok: kwOk, score: kw.score, matched: t.keywords.filter(k => !kw.missing.includes(k)), missingKeys: kw.missing, best: byRef?.best ?? taskExpectedPhrases(t, line)[0] ?? null, empty: false }
}
