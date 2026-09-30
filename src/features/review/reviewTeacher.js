// Строки учителя в начале и в итоге сессии повторения — собраны из данных,
// без заготовок на каждый случай (PROJECT.md → «Формат повторения»).

// ~15 с на карточку: 8 карточек → «2 мин»
export const sessionMinutes = cards => Math.max(1, Math.round(cards * 15 / 60))

// «trying», «trying и to», «trying, to и cook», «trying, to, cook и ещё 2»
function list(words, max = 3) {
  if (words.length > max) return `${words.slice(0, max).join(', ')} и ещё ${words.length - max}`
  return words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} и ${words.at(-1)}`
}

// Вступление — реплики учителя, по одной на пузырь (ReviewIntro.jsx). Чата не
// называем: учитель «пересылает сообщения». words: слова сессии; memory: строки
// word_memory (lapses > 0 — слово уже давалось непросто); phrase — фраза к
// закреплению ({ title }) или null
export function introLines({ words, memory = [], phrase = null }) {
  const lines = []
  if (words.length) {
    lines.push('Сейчас я перешлю тебе несколько сообщений — вспомни слова из них.')
    const shaky = memory.filter(m => words.includes(m.word) && m.lapses > 0).map(m => m.word).slice(0, 3)
    if (shaky.length) lines.push(`${list(shaky)} в прошлый раз ${shaky.length === 1 ? 'давалось' : 'давались'} непросто — посмотрим, как сейчас.`)
  }
  if (phrase) {
    lines.push(words.length
      ? `А в конце соберём фразу «${phrase.title}» целиком.`
      : `Ты уже уверенно вспоминаешь все слова фразы «${phrase.title}» — пора собрать её целиком.`)
  }
  return lines
}

// results: [{ word, outcome, applied }] — ответ сервера по словам сессии
export function summaryLine(results) {
  const grew  = results.filter(r => (r.outcome === 'good' || r.outcome === 'know') && r.applied !== false).map(r => r.word)
  const shaky = results.filter(r => r.outcome === 'again' || r.outcome === 'fail').map(r => r.word)
  const parts = []
  if (grew.length) parts.push(`${list(grew)} ${grew.length === 1 ? 'теперь помнится' : 'теперь помнятся'} лучше`)
  if (shaky.length) {
    const one = shaky.length === 1
    parts.push(`${list(shaky)} ${one ? 'пока даётся' : 'пока даются'} непросто — вернёмся к ${one ? 'нему' : 'ним'} завтра`)
  }
  if (!parts.length) return 'Слова держатся — так и продолжим.'
  return parts.join(', ') + '.'
}
