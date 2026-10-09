// Чистые помощники над событиями журнала старта: ev = [[t_мс, тип, детали], ...].
// Семплер кадров пишет в 'sample' только ИЗМЕНИВШИЕСЯ поля («k=v k=v»), 'tick' с '=' — «без изменений».

export const fmtT = t => String(t < 100 ? Math.round(t * 10) / 10 : Math.round(t))

// Устойчивая сортировка по времени (метки PerformanceObserver приходят с собственным временем, не по порядку записи)
export function sortEvents(ev) {
  return ev.map((e, i) => [e, i]).sort((a, b) => a[0][0] - b[0][0] || a[1] - b[1]).map(x => x[0])
}

// 'bg=rgb(0,0,0) fd=0.5' → { bg: 'rgb(0,0,0)', fd: '0.5' }
export function parseKv(detail) {
  const out = {}
  for (const part of String(detail || '').split(' ')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1)
  }
  return out
}

// Восстановить полное состояние на каждом семпле: [{ t, state, changed, prev }]
export function replaySamples(ev) {
  const out = []
  let state = {}
  for (const e of sortEvents(ev)) {
    if (e[1] !== 'sample') continue
    const changed = parseKv(e[2])
    const prev = state
    state = { ...state, ...changed }
    out.push({ t: e[0], state, changed, prev })
  }
  return out
}

// Строки журнала сплэша '[1.23] splash: улетает' → события на общей шкале (секунды → мс, точность 10 мс)
export function splashLineEvents(lines) {
  const out = []
  for (const l of lines || []) {
    const m = /^\[(\d+(?:\.\d+)?)\]\s*(.*)$/.exec(String(l))
    if (m) out.push([Math.round(parseFloat(m[1]) * 1000), 'splash-log', m[2]])
  }
  return out
}

// Подряд идущие «tick =» схлопываем в одну строку «без изменений (×N)»; остальное — как есть
export function collapseTicks(ev) {
  const out = []
  for (const e of ev) {
    const last = out[out.length - 1]
    if (e[1] === 'tick' && last && last.tick) { last.n++; last.to = e[0]; continue }
    if (e[1] === 'tick') { out.push({ tick: true, n: 1, t: e[0], to: e[0] }); continue }
    out.push({ t: e[0], type: e[1], detail: e[2] })
  }
  return out
}

// Все события записи на общей шкале: ev + строки журнала сплэша (__splashLog), по времени
export function fullEvents(rec) {
  return sortEvents([...(rec.ev || []), ...splashLineEvents(rec.splash)])
}
