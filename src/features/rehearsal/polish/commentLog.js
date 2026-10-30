// Журнал игры в комментарии: последние строки журнала отладки (dbg.dump().events, wordLaneDebug.js) в виде коротких строк «12.34 с type kind {данные}». Уровень голоса (level) не берём — он пишется ≈ 20 раз в секунду и
// вытеснил бы все остальные события. Чистые функции без React.
export const LOG_LINES = 40
export const LOG_LINE_MAX = 240

/** Событие журнала → строка: «12.34 с pill snap {"pill":3,"piece":1}» */
export function logLine(ev) {
  const { t = 0, type = '', kind, ...rest } = ev ?? {}
  const data = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : ''
  const s = `${(t / 1000).toFixed(2)} с ${type}${kind == null ? '' : ` ${kind}`}${data}`
  return s.length > LOG_LINE_MAX ? `${s.slice(0, LOG_LINE_MAX - 1)}…` : s
}

/** Последние n строк журнала без level. dump — результат dbg.dump() (null у выключенной отладки → пусто) */
export function lastLogLines(dump, n = LOG_LINES) {
  const events = Array.isArray(dump?.events) ? dump.events : []
  return events.filter(e => e?.type !== 'level').slice(-n).map(logLine)
}
