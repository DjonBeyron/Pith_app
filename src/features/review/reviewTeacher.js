import { plural } from '../../shared/lib/plural.js'

// Строки учителя в начале и в итоге сессии повторения — собраны из данных,
// без заготовок на каждый случай (PROJECT.md → «Формат повторения»).

// ~15 с на карточку: 8 карточек → «2 мин»
export const sessionMinutes = cards => Math.max(1, Math.round(cards * 15 / 60))

// «trying», «trying и to», «trying, to и cook», «trying, to, cook и ещё 2»
function list(words, max = 3) {
  if (words.length > max) return `${words.slice(0, max).join(', ')} и ещё ${words.length - max}`
  return words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} и ${words.at(-1)}`
}

// words: слова сессии; cards: сколько карточек; memory: строки word_memory
// (lapses > 0 — слово уже путали)
export function introLine({ words, cards, memory = [] }) {
  const n = words.length
  const head = `Сегодня ${n} ${plural(n, 'слово', 'слова', 'слов')} · около ${sessionMinutes(cards)} мин.`
  const shaky = memory.filter(m => words.includes(m.word) && m.lapses > 0).map(m => m.word).slice(0, 3)
  if (!shaky.length) return `${head} Поехали!`
  return `${head} ${list(shaky)} ${shaky.length === 1 ? 'уже путалось' : 'уже путались'} — посмотрим, как сейчас.`
}

// results: [{ word, outcome, applied }] — ответ сервера по словам сессии
export function summaryLine(results) {
  const grew  = results.filter(r => (r.outcome === 'good' || r.outcome === 'know') && r.applied !== false).map(r => r.word)
  const shaky = results.filter(r => r.outcome === 'again' || r.outcome === 'fail').map(r => r.word)
  const parts = []
  if (grew.length) parts.push(`${list(grew)} ${grew.length === 1 ? 'окрепло' : 'окрепли'}`)
  if (shaky.length) parts.push(`${list(shaky)} ${shaky.length === 1 ? 'шатается' : 'шатаются'} — вернёмся завтра`)
  if (!parts.length) return 'Слова держатся — так и продолжим.'
  return parts.join(', ') + '.'
}
