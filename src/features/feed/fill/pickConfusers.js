// Похожие слова для игры «Дополни реплику» (B5): верное слово + два «двойника» (sheep / ship / chip) — чистая функция,
// без сети и React. Похожесть — по написанию: общее начало, общий конец, общие пары букв, близкая длина. Формы того же
// слова (try / tried / tries) двойниками не берём: в реплике они могли бы подойти обе, и игра стала бы нечестной.
// Варианты показываются ТОЛЬКО текстом (озвучивается одна реплика, а не варианты).
const WORD_RE = /^[a-z][a-z'-]*$/
export const MIN_SIMILARITY = 1 // слабее — слова между собой не похожи, двойником не берём

const norm = w => String(w ?? '').toLowerCase().replace(/[’‘`´]/g, "'").trim()

function commonPrefix(a, b) {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}
const commonSuffix = (a, b) => commonPrefix([...a].reverse().join(''), [...b].reverse().join(''))

function bigrams(w) {
  const out = new Map()
  for (let i = 0; i < w.length - 1; i++) out.set(w.slice(i, i + 2), (out.get(w.slice(i, i + 2)) ?? 0) + 1)
  return out
}

// Коэффициент Дайса по парам букв: 0..1
function dice(a, b) {
  const A = bigrams(a)
  const B = bigrams(b)
  let hit = 0
  for (const [k, n] of A) hit += Math.min(n, B.get(k) ?? 0)
  const total = Math.max(0, a.length - 1) + Math.max(0, b.length - 1)
  return total ? (2 * hit) / total : 0
}

// Один корень (try/tried, keep/keeps, go/going): общее начало почти равно короткому слову
export function sameStem(a, b) {
  const p = commonPrefix(norm(a), norm(b))
  return p >= 2 && p >= Math.min(a.length, b.length) - 1
}

// Насколько cand похоже на word (больше — похожее; ≥ MIN_SIMILARITY — годится)
export function similarity(word, cand) {
  const a = norm(word)
  const b = norm(cand)
  const gap = Math.abs(a.length - b.length)
  return commonPrefix(a, b) * 1.5 + commonSuffix(a, b) + dice(a, b) * 4 + (gap <= 1 ? 0.5 : 0) - gap * 0.3
}

// word — верное слово; pool — любые слова (колоды, слова реплик); → до count слов (по убыванию похожести).
// Меньше двух — значит, пара не набралась и игру на этом слове лучше не предлагать. rand — только для ничьих
export function pickConfusers(word, pool, { count = 2, rand = Math.random } = {}) {
  const target = norm(word)
  const seen = new Set([target])
  const scored = []
  for (const raw of pool ?? []) {
    const w = norm(raw)
    if (seen.has(w) || w.length < 2 || !WORD_RE.test(w)) continue
    seen.add(w)
    if (sameStem(target, w)) continue
    const score = similarity(target, w)
    if (score >= MIN_SIMILARITY) scored.push({ w, score: score + rand() * 0.1 })
  }
  return scored.sort((x, y) => y.score - x.score).slice(0, count).map(x => x.w)
}
