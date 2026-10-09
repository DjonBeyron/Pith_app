// Ловушки Vosk (тест B): говорим слова, которых НЕТ в словаре ["try","trying","[unk]"], или молчим. Правильный ответ — [unk] или пусто;
// если движок принудительно выдал «try»/«trying» — это ложное принятие. Чистые функции без React.
import { TEST_GRAMMAR } from './voskReport.js'
import { grammarWords, UNK } from './voskGrammar.js'
import { heardTokens } from './voskClassify.js'

export const TRAP_GRAMMAR = TEST_GRAMMAR
export const TRAP_ALLOWED = grammarWords(TRAP_GRAMMAR)
export const TRAP_PRESETS = ['tried', 'tries', 'trine', 'hello', 'train', 'treat']
export const SILENCE_MS = 3000 // «Тишина 3 с»: запись без речи фиксированной длины

/** Слово-ловушка из поля ввода: латиница, 2–20 букв, не из словаря (иначе это не ловушка). Нельзя → null */
export function cleanTrapWord(s) {
  const w = String(s ?? '').trim().toLowerCase()
  return /^[a-z]{2,20}$/.test(w) && !TRAP_ALLOWED.includes(w) ? w : null
}

/** Результат на ловушке: accepted (слово из словаря, sw — какое) | rejected ([unk]) | empty | other */
export function classifyTrap(heard, allowed = TRAP_ALLOWED) {
  const toks = heardTokens(heard)
  if (!toks.length) return { out: 'empty', sw: null }
  const sw = toks.find(t => allowed.includes(t))
  if (sw) return { out: 'accepted', sw }
  return { out: toks.every(t => t === UNK) ? 'rejected' : 'other', sw: null }
}

export const trapSpec = word => ({ kind: 'trap', mode: 'trap', step: word, tag: word, said: word, correct: null, grammar: TRAP_GRAMMAR, keys: null, allowed: TRAP_ALLOWED })
export const silenceSpec = () => ({ kind: 'silence', mode: 'trap', step: 'silence', tag: 'тишина', said: '', correct: null, grammar: TRAP_GRAMMAR, keys: null, allowed: TRAP_ALLOWED, maxMs: SILENCE_MS })

/** Счётчик: { n — прогонов, bad — ложных принятий, silence/silenceBad — отдельно по тишине } */
export function trapCount(runs) {
  const t = (runs || []).filter(r => r.kind === 'trap' || r.kind === 'silence')
  const s = t.filter(r => r.kind === 'silence')
  const bad = list => list.filter(r => r.out === 'accepted').length
  return { n: t.length, bad: bad(t), silence: s.length, silenceBad: bad(s) }
}

export const trapSayText = run => (run.kind === 'silence' ? 'Сказали: ничего (тишина 3 с)' : `Сказали «${run.said}»`)
