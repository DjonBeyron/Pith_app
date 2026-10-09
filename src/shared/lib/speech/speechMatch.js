// Сравнение сказанной фразы с эталоном (проба «Голос» и модуль «Сказать фразу»; чистые функции, без React).
// Порядок слов не важен: слова эталона сопоставляются со словами услышанного жадно, лучшими парами первыми.

// Сокращения → полная форма (чтобы «I'm» и «I am» совпадали). Апострофы приводим к ' заранее
const CONTRACTIONS = {
  "i'm": 'i am', "you're": 'you are', "we're": 'we are', "they're": 'they are',
  "he's": 'he is', "she's": 'she is', "it's": 'it is', "that's": 'that is', "there's": 'there is',
  "what's": 'what is', "who's": 'who is', "here's": 'here is', "let's": 'let us',
  "i've": 'i have', "you've": 'you have', "we've": 'we have', "they've": 'they have',
  "i'll": 'i will', "you'll": 'you will', "he'll": 'he will', "she'll": 'she will',
  "we'll": 'we will', "they'll": 'they will', "it'll": 'it will',
  "i'd": 'i would', "you'd": 'you would', "he'd": 'he would', "she'd": 'she would',
  "we'd": 'we would', "they'd": 'they would',
  "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "can't": 'can not', cannot: 'can not',
  "won't": 'will not', "wouldn't": 'would not', "shouldn't": 'should not', "couldn't": 'could not',
  "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not',
  "haven't": 'have not', "hasn't": 'has not', "hadn't": 'had not', "mustn't": 'must not',
  "ain't": 'is not', gonna: 'going to', wanna: 'want to', gotta: 'got to',
}

export const PASS_RATIO = 0.7

/** Строка → слова: нижний регистр, апострофы, сокращения раскрыты, знаки препинания убраны */
export function tokenize(text) {
  const s = String(text ?? '')
    .toLowerCase()
    .replace(/[‘’‛ʼ´`]/g, "'")
    .replace(/[^a-z0-9'\s]/g, ' ')
  const out = []
  for (const raw of s.split(/\s+/)) {
    const w = raw.replace(/^'+|'+$/g, '')
    if (!w) continue
    const full = CONTRACTIONS[w]
    if (full) out.push(...full.split(' '))
    else out.push(w.replace(/'/g, '')) // «john's» → «johns»: чужие апострофы просто убираем
  }
  return out.filter(Boolean)
}

/** Расстояние Левенштейна между двумя словами */
export function levenshtein(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

/** Допуск по длине слова эталона: короткие слова (a, to, is) — только точно, чтобы «to» не принималось за «do» */
export function tolerance(len) {
  if (len <= 2) return 0
  if (len <= 5) return 1
  if (len <= 8) return 2
  return 3
}

/**
 * Сравнить услышанное с эталоном. passRatio — доля слов эталона для «засчитано» (по умолчанию 0,7; у модуля — порог ноды).
 * @returns {{matched: string[], missed: string[], extra: string[], items: {word: string, ok: boolean, heard: string|null}[],
 *   ratio: number, passed: boolean}} items — слова эталона по порядку (для раскраски)
 */
export function matchPhrase(reference, heard, keywords = [], passRatio = PASS_RATIO) {
  const ref = tokenize(reference)
  const hyp = tokenize(heard)
  const pairs = []
  ref.forEach((rw, i) => hyp.forEach((hw, j) => {
    const d = levenshtein(rw, hw)
    if (d <= tolerance(rw.length)) pairs.push({ i, j, d })
  }))
  // лучшие пары первыми: меньше расстояние, затем ближе по позиции (одинаковые слова встают по порядку)
  pairs.sort((x, y) => x.d - y.d || Math.abs(x.i - x.j) - Math.abs(y.i - y.j) || x.i - y.i)
  const refTaken = new Array(ref.length).fill(null)
  const hypTaken = new Array(hyp.length).fill(false)
  for (const { i, j } of pairs) {
    if (refTaken[i] !== null || hypTaken[j]) continue
    refTaken[i] = j
    hypTaken[j] = true
  }
  const items = ref.map((word, i) => ({ word, ok: refTaken[i] !== null, heard: refTaken[i] !== null ? hyp[refTaken[i]] : null }))
  const matched = items.filter(it => it.ok).map(it => it.word)
  const missed = items.filter(it => !it.ok).map(it => it.word)
  const extra = hyp.filter((_, j) => !hypTaken[j])
  const ratio = ref.length ? matched.length / ref.length : 0
  // ключевое слово, которого нет в эталоне, не учитываем; слово из нескольких токенов — все токены должны совпасть
  const keys = [...new Set(keywords.flatMap(tokenize))].filter(k => ref.includes(k))
  const keysOk = keys.every(k => items.some(it => it.word === k && it.ok))
  return { matched, missed, extra, items, ratio, passed: ref.length > 0 && ratio >= passRatio - 1e-9 && keysOk }
}

/** Лучший из вариантов распознавания (maxAlternatives): больше ratio, при равенстве — меньше лишних слов */
export function matchBest(reference, alternatives, keywords = [], passRatio = PASS_RATIO) {
  let best = null
  alternatives.forEach((text, index) => {
    const r = matchPhrase(reference, text, keywords, passRatio)
    if (!best || r.ratio > best.ratio || (r.ratio === best.ratio && r.extra.length < best.extra.length)) best = { ...r, index, text }
  })
  return best ?? { ...matchPhrase(reference, '', keywords, passRatio), index: -1, text: '' }
}
