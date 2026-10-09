// Диагностика «домысливания» и решающие правила пробы «Голос» (режим 9 — не захват, а РЕШЕНИЕ по всем данным попытки).
// Чистые функции без React. «Ключевые слова» — слова эталона, у которых есть ошибочные формы (trying ↔ try/tried/tries);
// если ошибочных форм нет — ключевыми считаются все слова эталона. ok = «слово подтверждено» (форма верна).
import { tokenize, levenshtein, matchPhrase } from '../../../shared/lib/speech/speechMatch.js'
import { matchConsensus } from '../../../shared/lib/speech/sayConsensus.js'
import { firstSeenRule } from '../../../shared/lib/speech/firstSeenRule.js'
import { sameFamily } from '../../../shared/lib/speech/wordFamily.js'
import { snapshotsOf, formStats, flashSummary, END_EVENTS } from '../../../shared/lib/speech/flashDwell.js'
import { buildChain, analyzeChain } from './attemptDiff.js'

/** Для каждого токена эталона — ошибочные токены на его месте: Map(слово → Set). Фразы той же длины сравниваем по позиции,
 *  остальные — каждое «чужое» слово привязываем к ближайшему слову эталона (расстояние ≤ 3) */
export function wrongTokenMap(reference, wrongPhrases) {
  const ref = tokenize(reference)
  const map = new Map()
  const add = (w, t) => { if (t && t !== w) map.set(w, (map.get(w) ?? new Set()).add(t)) }
  for (const phrase of wrongPhrases) {
    const hyp = tokenize(phrase)
    if (hyp.length === ref.length) { hyp.forEach((t, i) => add(ref[i], t)); continue }
    for (const t of hyp) {
      if (ref.includes(t)) continue
      let best = null
      for (const w of ref) { const d = levenshtein(w, t); if (d <= 3 && (!best || d < best.d)) best = { w, d } }
      if (best) add(best.w, t)
    }
  }
  return map
}

export const keysOf = (reference, map) => (map.size ? [...map.keys()] : [...new Set(tokenize(reference))])

/** Состояние каждого ключевого слова в тексте гипотезы: 'ref' (слово эталона есть) | 'wrong' (вместо него ошибочная форма) | 'none' */
export function classify(text, map, keys) {
  const tokens = tokenize(text)
  const state = {}
  const literal = []
  for (const k of keys) {
    const bad = [...(map.get(k) ?? [])].find(t => tokens.includes(t))
    state[k] = tokens.includes(k) ? 'ref' : bad ? 'wrong' : 'none'
    if (state[k] === 'wrong') literal.push(bad)
  }
  return { state, literal }
}

/** Слова эталона, по которым считаем «мелькание» в серии: ключевое слово шага (extra.series.word); null — все ключевые слова попытки */
export const focusOf = extra => (extra?.series?.word ? tokenize(extra.series.word) : null)

/**
 * Ошибочные формы, МЕЛЬКНУВШИЕ в потоке: любое слово «семьи» ключевого слова, стоявшее в ЛЮБОМ элементе истории interim (в том числе заменённое позже),
 * формы из списка ошибок и слово «было» из замены движка (changes[].from → слово эталона). У каждой — когда впервые, сколько мс подряд, на конце речи ли, в итоге ли.
 */
function collectFlash({ fs, map, keys, focus, fixed, history, final, lastInterim }) {
  const words = focus?.length ? focus : keys
  const out = new Map()
  const put = (word, f) => out.has(`${word}|${f.form}`) || out.set(`${word}|${f.form}`, { word, ...f })
  for (const d of fs.disputed) if (words.includes(d.word)) put(d.word, { form: d.form, firstAt: d.firstAt, dwellMs: d.dwellMs, atEnd: d.atEnd, inFinal: d.inFinal, interim: d.interim })
  const snaps = snapshotsOf({ history, final, lastInterim })
  const endTimes = history.filter(h => END_EVENTS.includes(h?.kind) && typeof h.t === 'number').map(h => h.t)
  const extra = words.flatMap(w => [...(map.get(w) ?? [])].map(form => [w, form]))
  for (const c of fixed) if (c.dir === 'toRef' && words.includes(c.to)) extra.push([c.to, c.from])
  for (const [word, form] of extra) {
    const st = formStats(snaps, form, endTimes)
    if (st.any) put(word, { form, firstAt: st.firstAt, dwellMs: st.dwellMs, atEnd: st.atEnd, inFinal: st.inFinal, interim: st.interim })
  }
  const forms = [...out.values()]
  return { forms, ...flashSummary(forms) }
}

const confOf = a => (typeof a?.confidence === 'number' ? a.confidence : -1)
const missedKeys = (items, keys) => keys.filter(k => items.some(it => it.word === k && !it.ok))

/**
 * Разбор одной попытки. Вход: reference, wrong (фразы), view-подобный объект { final, alternatives, history, lastInterim }, dwellMs — выдержка правила
 * «первое увиденное» (firstSeenRule.js), focus — слова эталона для «мелькания» (focusOf). Нет итога → null.
 */
export function analyzeAttempt({ reference, wrong = [], final, alternatives = [], history = [], lastInterim = '', dwellMs, focus = null }) {
  if (!final?.text) return null
  const map = wrongTokenMap(reference, wrong)
  const keys = keysOf(reference, map)
  const cls = text => classify(text, map, keys)
  const alts = alternatives.length ? alternatives : [final]
  const nbest = alts.map((a, i) => ({ ...a, ...cls(a.text), top: i === 0 }))
  const timeline = history.filter(h => typeof h.text === 'string').map(h => ({ ...h, ...cls(h.text) })) // тексты; служебные события {t, kind} — отдельно (events)
  const events = history.filter(h => h.kind).map(h => ({ t: h.t, kind: h.kind }))
  const diff = analyzeChain(buildChain({ history, final, lastInterim }), reference)
  // В серии «исправил» — только замена ключевого слова (trying), а не любого слова эталона («play → please» — другое слово)
  const fixed = focus?.length ? diff.fixed.filter(c => focus.some(w => sameFamily(c.from, w) || sameFamily(c.to, w))) : diff.fixed

  const exact = { exactWords: true }
  const top1Items = matchPhrase(reference, final.text, [], 1, exact).items
  const cons = matchConsensus(reference, final.text, lastInterim, [], 1, exact)
  const top1 = { missed: missedKeys(top1Items, keys) }
  const consensus = { missed: missedKeys(cons.items, keys), used: cons.consensus, fixed: cons.engineFixed.filter(w => keys.includes(w)) }
  const blockers = alts.slice(1).map((a, i) => ({ ...a, no: i + 2, literal: cls(a.text).literal }))
    .filter(a => a.literal.length && confOf(a) >= confOf(alts[0]))
  const strict = { used: alts.length > 1, blockers, suspect: alts.slice(1).some(a => cls(a.text).literal.length) }
  top1.ok = top1.missed.length === 0
  consensus.ok = consensus.missed.length === 0
  strict.ok = consensus.ok && blockers.length === 0
  const fs = firstSeenRule({ reference, history, final, lastInterim, dwellMs, keys }) // восстановленное «как слышал движок до исправления»
  const first = { ok: fs.missed.length === 0, missed: fs.missed, used: fs.used, details: fs }

  const where = []
  const places = [] // где встретилась ошибочная форма: top1 | alt#N | interim@мс (для компактного отчёта)
  nbest.forEach((a, i) => {
    if (!a.literal.length) return
    where.push(i === 0 ? `итог (№1) «${a.text}»` : `N-best №${i + 1} «${a.text}»`)
    places.push({ at: i === 0 ? 'top1' : `alt#${i + 1}`, word: a.literal[0] })
  })
  const lit = timeline.filter(h => !h.final && h.literal.length)
  lit.slice(0, 3).forEach(h => where.push(`interim ${h.t} мс «${h.text}»`))
  lit.forEach(h => places.push({ at: 'interim', t: h.t, word: h.literal[0] }))
  // Ошибочная форма «встретилась», если она стояла в ЛЮБОМ элементе истории interim (даже заменённом позже) или была словом «было» в замене движка —
  // а не только если она есть в списке ошибок: движок мог мелькнуть другой формой семьи
  const flash = collectFlash({ fs, map, keys, focus, fixed, history, final, lastInterim })
  for (const f of flash.forms) {
    if (!f.interim || places.some(p => p.at === 'interim' && p.word === f.form)) continue
    where.push(`«${f.form}» стояла в interim с ${f.firstAt ?? '?'} мс (${f.dwellMs == null ? 'время неизвестно' : `${f.dwellMs} мс`})`)
    places.push({ at: 'interim', t: f.firstAt, word: f.form })
  }
  return {
    keys, map, nbest, timeline, events, diff, changes: diff.changes, fixed, engineFixed: fixed.length > 0,
    fixedAt: fixed[0] ? { t: fixed[0].at, final: fixed[0].step === 'interim→final' } : null,
    literalSeen: where.length > 0 || flash.forms.length > 0, where, places, flash,
    verdicts: { top1, consensus, strict, first, all: top1.ok && consensus.ok && strict.ok && first.ok },
  }
}

/** Что сказал пользователь по его ручной подписи: 'wrong' (ошибочная форма), 'ref' (форма эталона) или null */
export function saidKind(said, analysis) {
  if (!analysis || !String(said ?? '').trim()) return null
  const tokens = tokenize(said)
  const wrongs = analysis.keys.flatMap(k => [...(analysis.map.get(k) ?? [])])
  if (tokens.some(t => wrongs.includes(t))) return 'wrong'
  return analysis.keys.some(k => tokens.includes(k)) ? 'ref' : null
}

/** Оценка вердикта по тому, что сказали: ловит ли правило ошибку. null — подпись не задана/не опознана */
export function judge(kind, ok) {
  if (kind === 'wrong') return ok ? { good: false, label: 'пропустило ошибку' } : { good: true, label: 'поймало ошибку' }
  if (kind === 'ref') return ok ? { good: true, label: 'верно принято' } : { good: false, label: 'ложно отклонило' }
  return null
}

/** Текст результата (Vosk и т. п.) относительно эталона: 'ref' | 'wrong' | 'other' | 'empty' */
export function classifyPhrase(text, reference, wrong = []) {
  const n = tokenize(text).join(' ')
  if (!n) return 'empty'
  if (n === tokenize(reference).join(' ')) return 'ref'
  if (wrong.some(w => tokenize(w).join(' ') === n)) return 'wrong'
  return 'other'
}
