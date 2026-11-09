// Слова для метрик честности стенда пилюль (pillStandHonesty.js): нормализация услышанного и цели одним способом — строчные, «ё» ≡ «е», без знаков по краям, [unk] выброшен;
// у английской цели ещё и раскрытые сокращения (tokenize: «I'm» → «i am»), чтобы «am» не считалось «додуманным». Чистые функции.
import { tokenize } from '../../shared/lib/speech/speechMatch.js'

const edge = w => w.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '')

/** Строка → слова: строчные, ё → е, без знаков по краям, без [unk] */
export const heardWords = text => String(text ?? '').toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(w => w && w !== '[unk]').map(edge).filter(Boolean)

/** Слова цели (множество): как написаны и в раскрытом виде (en) */
export function targetSet(say) {
  const set = new Set(heardWords(say))
  for (const t of tokenize(say)) set.add(t)
  for (const w of [...set]) set.add(w.replace(/'/g, ''))
  return set
}

/** Слово w есть в цели (точно или с отличием в одну букву у слов длиннее 4 — Vosk склеивает окончания) */
export function inTarget(w, set) {
  if (set.has(w) || set.has(w.replace(/'/g, ''))) return true
  if (w.length < 5) return false
  for (const t of set) if (Math.abs(t.length - w.length) <= 1 && near(t, w)) return true
  return false
}

const near = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i) }
