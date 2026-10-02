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

// results: [{ word, outcome, applied }] — ответ сервера по словам сессии. Каждое слово попадает ровно
// в одну группу, и для каждой — своя забота:
//   выросло (good, шаг засчитан)       — «теперь помнится лучше»;
//   вспомнилось не сразу (hard)         — шаг не меняется: говорим об этом прямо и без упрёка;
//   повторено раньше срока (applied=false) — шаг не меняется по правилам: объясняем, зачем это всё равно хорошо;
//   даётся непросто (again / fail)      — «вернёмся завтра».
// Группы через «;», в конце точка. Слов нет вовсе — спокойная строка по умолчанию
export function summaryLine(results) {
  const groups = { grew: [], slow: [], early: [], shaky: [] }
  for (const r of results) {
    if (r.outcome === 'again' || r.outcome === 'fail') groups.shaky.push(r.word)
    else if (r.applied === false) groups.early.push(r.word)
    else if (r.outcome === 'hard') groups.slow.push(r.word)
    else if (r.outcome === 'good') groups.grew.push(r.word)
  }
  const one = ws => ws.length === 1
  const parts = []
  if (groups.grew.length) parts.push(`${list(groups.grew)} ${one(groups.grew) ? 'теперь помнится' : 'теперь помнятся'} лучше`)
  if (groups.slow.length) parts.push(`${list(groups.slow)} ${one(groups.slow) ? 'вспомнилось' : 'вспомнились'} не сразу — потренируемся ещё`)
  if (groups.early.length) parts.push(`${list(groups.early)} ${one(groups.early) ? 'повторено' : 'повторены'} раньше срока — ступень не меняется, зато память крепче`)
  if (groups.shaky.length) {
    parts.push(`${list(groups.shaky)} ${one(groups.shaky) ? 'пока даётся' : 'пока даются'} непросто — вернёмся к ${one(groups.shaky) ? 'нему' : 'ним'} завтра`)
  }
  if (!parts.length) return 'Слова на месте — вернёмся к ним в своё время.'
  return parts.join('; ') + '.'
}
