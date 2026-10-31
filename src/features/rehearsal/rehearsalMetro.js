// Подсветка кусков по времени («метроном» читки и повтора ученика): stage.metro — [{ chunk, at, ms }], время от старта стадии. Раньше на каждый кусок вешался свой setTimeout (и один на «погасить»), и хук чистил их
// списком; теперь живёт ОДИН таймер — на ближайшее событие, следующий ставится из него. Отмена одна и надёжная: после cancel() не остаётся ни таймеров, ни обращений к set() (смена стадии, пауза, размонтирование).
// Чистая функция без React: часы и таймеры подставляются — проверяется тестами.

/** События подсветки: кусок включается в at, после последнего куска (at + ms) подсветка гаснет (−1) */
export function metroEvents(metro) {
  if (!metro?.length) return []
  const last = metro.at(-1)
  return [...metro.map(m => ({ at: m.at, chunk: m.chunk })), { at: last.at + last.ms, chunk: -1 }]
}

/**
 * set(chunk) — какой кусок подсвечен (−1 — никакой); start — performance.now() старта стадии. Возвращает cancel(): таймер снят, подсветка погашена (set(−1)).
 * Опоздавший таймер (поток был занят) не страшен: события, время которых уже прошло, выполняются подряд с нулевой задержкой, а не пропускаются.
 */
export function scheduleMetro(metro, { start, set, now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout }) {
  const events = metroEvents(metro)
  if (!events.length) return () => {}
  let i = 0
  let id = 0
  let dead = false
  const next = () => {
    if (dead || i >= events.length) return
    const e = events[i]
    id = setTimer(() => { id = 0; if (dead) return; set(e.chunk); i += 1; next() }, Math.max(0, e.at - (now() - start)))
  }
  next()
  return () => { dead = true; clearTimer(id); id = 0; set(-1) }
}
