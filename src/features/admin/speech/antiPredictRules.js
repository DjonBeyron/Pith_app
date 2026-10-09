// Диагностика «домысливания» и решающие правила пробы «Голос» (режим 9 — не захват, а РЕШЕНИЕ по всем данным попытки).
// Чистые функции без React. «Ключевые слова» — слова эталона, у которых есть ошибочные формы (trying ↔ try/tried/tries);
// если ошибочных форм нет — ключевыми считаются все слова эталона. ok = «слово подтверждено» (форма верна).
import { tokenize, levenshtein, matchPhrase } from '../../../shared/lib/speech/speechMatch.js'
import { matchConsensus } from '../../../shared/lib/speech/sayConsensus.js'

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

const confOf = a => (typeof a?.confidence === 'number' ? a.confidence : -1)
const missedKeys = (items, keys) => keys.filter(k => items.some(it => it.word === k && !it.ok))

/** Первое превращение «ошибочная форма → форма эталона» в истории interim/final: когда и в чём */
function findFlip(timeline, keys) {
  for (let i = 0; i < timeline.length; i++) {
    for (const k of keys) {
      if (timeline[i].state[k] !== 'wrong') continue
      const j = timeline.findIndex((h, n) => n > i && h.state[k] === 'ref')
      if (j >= 0) return { key: k, wrong: timeline[i].literal[0], fromT: timeline[i].t, toT: timeline[j].t, toFinal: !!timeline[j].final, from: timeline[i].text, to: timeline[j].text }
    }
  }
  return null
}

/**
 * Разбор одной попытки. Вход: reference, wrong (фразы), view-подобный объект { final, alternatives, history, lastInterim }.
 * Нет итога → null.
 */
export function analyzeAttempt({ reference, wrong = [], final, alternatives = [], history = [], lastInterim = '' }) {
  if (!final?.text) return null
  const map = wrongTokenMap(reference, wrong)
  const keys = keysOf(reference, map)
  const cls = text => classify(text, map, keys)
  const alts = alternatives.length ? alternatives : [final]
  const nbest = alts.map((a, i) => ({ ...a, ...cls(a.text), top: i === 0 }))
  const timeline = history.map(h => ({ ...h, ...cls(h.text) }))
  const flip = findFlip(timeline, keys)

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

  const where = []
  nbest.forEach((a, i) => { if (a.literal.length) where.push(i === 0 ? `итог (№1) «${a.text}»` : `N-best №${i + 1} «${a.text}»`) })
  timeline.filter(h => !h.final && h.literal.length).slice(0, 3).forEach(h => where.push(`interim ${h.t} мс «${h.text}»`))
  const engineFixed = !!flip || consensus.fixed.length > 0
  return {
    keys, map, nbest, timeline, flip, engineFixed,
    fixedAt: flip ? { t: flip.toT, final: flip.toFinal } : consensus.fixed.length ? { t: null, final: true } : null,
    literalSeen: where.length > 0, where,
    verdicts: { top1, consensus, strict, all: top1.ok && consensus.ok && strict.ok },
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
