// Пословный diff между соседними текстами попытки распознавания (проба «Голос», «домысливание» движка). Чистые функции.
// Цепочка попытки = [interim₁ … interimₙ, final]. Для каждой пары соседних текстов находим, какие слова поменялись:
//   replace — слово заменено (try → trying; ИЛИ в обратную сторону trying → try), insert/remove — вставлено/удалено в середине,
//   append  — дописано в конце (обычный рост фразы по ходу речи, исправлением НЕ считается).
// «Исправление движка» (engineFixed) = replace слова из «семьи» эталона (общая основа). Слова приводим к виду tokenize()
// («I'm» = «i am»), поэтому «I'm try» и «I am try» совпадают.
import { tokenize, levenshtein } from '../../../shared/lib/speech/speechMatch.js'
import { sameFamily } from '../../../shared/lib/speech/wordFamily.js'

export { sameFamily }

/** Выравнивание по самой длинной общей подпоследовательности → список операций eq / del / ins */
function align(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  }
  const ops = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { ops.push({ op: 'eq', w: a[i] }); i++; j++ } else if (j < b.length && (i === a.length || dp[i][j + 1] >= dp[i + 1][j])) ops.push({ op: 'ins', w: b[j++] })
    else ops.push({ op: 'del', w: a[i++] })
  }
  return ops
}

/** Пары «было → стало» внутри одного участка изменений: при равной длине по позиции, иначе ближайшие по семье */
function pairUp(dels, ins) {
  if (dels.length === ins.length) return { pairs: dels.map((w, k) => [w, ins[k]]), rest: [], left: [] }
  const used = new Set()
  const pairs = []
  const rest = []
  for (const d of dels) {
    let best = -1
    ins.forEach((w, k) => { if (!used.has(k) && sameFamily(d, w) && (best < 0 || levenshtein(d, w) < levenshtein(d, ins[best]))) best = k })
    if (best >= 0) { used.add(best); pairs.push([d, ins[best]]) } else rest.push(d)
  }
  return { pairs, rest, left: ins.filter((_, k) => !used.has(k)) }
}

/**
 * Изменения между двумя текстами: [{ kind: 'replace'|'insert'|'remove'|'append', from, to }].
 * replace: from/to — слова; insert: to; remove: from; append: to — дописанные в конце слова одной строкой.
 */
export function diffTexts(before, after) {
  const ops = align(tokenize(before), tokenize(after))
  const out = []
  let k = 0
  while (k < ops.length) {
    if (ops[k].op === 'eq') { k++; continue }
    let e = k
    while (e < ops.length && ops[e].op !== 'eq') e++
    const chunk = ops.slice(k, e)
    const dels = chunk.filter(o => o.op === 'del').map(o => o.w)
    const ins = chunk.filter(o => o.op === 'ins').map(o => o.w)
    const { pairs, rest, left } = pairUp(dels, ins)
    for (const [from, to] of pairs) out.push({ kind: 'replace', from, to })
    for (const from of rest) out.push({ kind: 'remove', from })
    if (left.length) out.push(e === ops.length ? { kind: 'append', to: left.join(' ') } : { kind: 'insert', to: left.join(' ') })
    k = e
  }
  return out
}

/** Цепочка попытки: interim из истории по порядку + итог. Нет истории — единственный interim берём из lastInterim */
export function buildChain({ history = [], final, lastInterim = '' } = {}) {
  const interim = history.filter(h => !h.final && h.text).map(h => ({ t: h.t ?? null, text: h.text }))
  if (!interim.length && lastInterim) interim.push({ t: null, text: lastInterim })
  const fin = history.filter(h => h.final).pop()
  return final?.text ? [...interim, { t: fin?.t ?? null, text: final.text, final: true }] : interim
}

/**
 * Разбор цепочки [interim…, final]. reference — эталон (слова его «семьи» — те, чья замена считается исправлением).
 * @returns {{ changes: {kind,from?,to?,at,step,idx,dir?,family?}[], fixed: [...], engineFixed: boolean, dir: string|null,
 *   reverse: boolean, appended: string[] }}
 * at — момент (мс от старта) более позднего текста пары; step — 'interim→interim' | 'interim→final'; idx — номер текста в цепочке;
 * dir у replace: 'toRef' (стало словом эталона), 'fromRef' (было словом эталона — обратное исправление), 'other'.
 */
export function analyzeChain(chain, reference) {
  const ref = tokenize(reference)
  const inFamily = w => ref.some(r => sameFamily(w, r))
  const changes = []
  for (let i = 1; i < chain.length; i++) {
    if (chain[i].text === chain[i - 1].text) continue
    const step = chain[i].final ? 'interim→final' : 'interim→interim'
    for (const c of diffTexts(chain[i - 1].text, chain[i].text)) {
      const ch = { ...c, at: chain[i].t, step, idx: i }
      if (c.kind === 'replace') {
        ch.dir = ref.includes(c.to) && !ref.includes(c.from) ? 'toRef' : ref.includes(c.from) && !ref.includes(c.to) ? 'fromRef' : 'other'
        ch.family = (inFamily(c.from) || inFamily(c.to)) && sameFamily(c.from, c.to) // оба слова — формы одного слова: «i → trying» (весь короткий текст заменили) исправлением не считаем
      }
      changes.push(ch)
    }
  }
  const fixed = changes.filter(c => c.kind === 'replace' && c.family)
  return {
    changes, fixed, engineFixed: fixed.length > 0, dir: fixed[0]?.dir ?? null,
    reverse: fixed.some(c => c.dir === 'fromRef'),
    appended: changes.filter(c => c.kind === 'append').map(c => c.to),
  }
}
