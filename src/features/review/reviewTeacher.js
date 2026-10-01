// Строка учителя в итоге сессии повторения и оценка минут — собраны из данных,
// без заготовок на каждый случай (PROJECT.md → «Формат повторения»). Вступления с репликами
// учителя больше нет: после «Ищу слова…» сразу идут карточки.

// ~15 с на карточку: 8 карточек → «2 мин»
export const sessionMinutes = cards => Math.max(1, Math.round(cards * 15 / 60))

// «trying», «trying и to», «trying, to и cook», «trying, to, cook и ещё 2»
function list(words, max = 3) {
  if (words.length > max) return `${words.slice(0, max).join(', ')} и ещё ${words.length - max}`
  return words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} и ${words.at(-1)}`
}

// results: [{ word, outcome, applied }] — ответ сервера по словам сессии
export function summaryLine(results) {
  const grew  = results.filter(r => r.outcome === 'good' && r.applied !== false).map(r => r.word)
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
