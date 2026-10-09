// Разбор результата Vosk: слова с уверенностью, классификация «как сказано / принял за … / отвергнуто / пусто» и тексты вывода простыми словами.
// Чистые функции. Главное слово шага — ключ (try / trying, goes / go…): судим по нему, а не по всей фразе.
import { UNK } from './voskGrammar.js'

const q = s => `«${s}»`
const num = (n, d) => (typeof n === 'number' && Number.isFinite(n) ? Number(n.toFixed(d)) : null)

export const heardTokens = text => String(text ?? '').toLowerCase().replace(/[‘’‛ʼ´`]/g, "'").split(/\s+/).filter(Boolean)

/** Слова результата Vosk (setWords) → компактно [[слово, уверенность, начало с, конец с], …] (≤ 10) */
export function parseWords(words) {
  return (Array.isArray(words) ? words : []).filter(w => w && typeof w.word === 'string').slice(0, 10)
    .map(w => [w.word, num(w.conf, 2), num(w.start, 2), num(w.end, 2)])
}

/** Уверенность первого слова key среди ws (null — слова нет или уверенность не пришла) */
export const confOfKey = (ws, key) => (key ? (ws || []).find(w => w[0] === key)?.[1] ?? null : null)

/**
 * Ключевое слово в услышанном (шаги A и пары C): out = asis (есть сказанное слово) | swapped (подменил другой формой, sw — какой) |
 * rejected ([unk] вместо слова) | empty (пусто) | other. keys = { say, ok, bad: [] }
 */
export function classifyKey({ heard, keys }) {
  const toks = heardTokens(heard)
  if (!toks.length) return { out: 'empty', sw: null }
  if (toks.includes(keys.say)) return { out: 'asis', sw: null }
  const sw = [keys.ok, ...keys.bad].filter(k => k && k !== keys.say).find(k => toks.includes(k)) ?? null
  if (sw) return { out: 'swapped', sw }
  return { out: toks.includes(UNK) ? 'rejected' : 'other', sw: null }
}

/** Вывод по прогону: { tone: 'ok' | 'warn' | 'bad' | 'none', text } */
export function verdictOf(run) {
  if (!run) return { tone: 'none', text: '' }
  const control = run.mode === 'control'
  const sw = run.sw ? q(run.sw) : ''
  if (run.kind === 'trap' || run.kind === 'silence') {
    if (run.out === 'accepted') return { tone: 'bad', text: `❌ ложно принято за ${sw}` }
    if (run.out === 'rejected') return { tone: 'ok', text: '✅ отвергнуто ([unk])' }
    if (run.out === 'empty') return { tone: 'ok', text: '✅ пусто — ничего не принято' }
    return { tone: 'warn', text: `⚠ другое: ${q(run.heard)}` }
  }
  switch (run.out) {
    case 'asis': return { tone: 'ok', text: control ? '✅ как сказано (правильно)' : '✅ как сказано (ошибка сохранена)' }
    case 'swapped': return { tone: 'warn', text: control ? `⚠ принял за ${sw} — ложная тревога` : `⚠ принял за ${sw} (подменил)` }
    case 'rejected': return { tone: 'warn', text: '➖ отвергнуто ([unk]) — слово не распознано' }
    case 'empty': return { tone: 'warn', text: '➖ пусто — ничего не услышал' }
    default: return { tone: 'warn', text: `⚠ другое: ${q(run.heard)}` }
  }
}

/** Пословная строка: «try → 1.00 → 0.75–1.53 с» */
export const wordLine = w => `${w[0]} → ${w[1] != null ? w[1].toFixed(2) : '—'} → ${w[2] != null && w[3] != null ? `${w[2]}–${w[3]} с` : 'время неизвестно'}`
