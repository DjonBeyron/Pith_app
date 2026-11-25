// Разбор трассы Chromium, снятой perf-run.mjs (TRACE=sprint,boss): на что уходит главный поток — время по видам работ (скрипт, пересчёт стилей, раскладка, покраска, слои), сколько пересчётов стилей
// ВЫНУЖДЕННЫХ (внутри скрипта: чтение размеров после записи стилей) и кто их вызвал (верх стека), самые дорогие функции по профилю V8. Сборка для трассы — MINIFY=0 (читаемые имена).
//   node _stand/race/perf-trace.mjs OUT/NAME-trace-sprint.json
import { readFileSync } from 'node:fs'

const { traceEvents: ev } = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const names = new Map(); for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args.name)
const count = new Map(); for (const e of ev) if (e.ph === 'X' && names.get(`${e.pid}:${e.tid}`) === 'CrRendererMain') count.set(`${e.pid}:${e.tid}`, (count.get(`${e.pid}:${e.tid}`) ?? 0) + 1)
const main = [...count].sort((a, b) => b[1] - a[1])[0]?.[0]
const X = ev.filter(e => e.ph === 'X' && `${e.pid}:${e.tid}` === main).sort((a, b) => a.ts - b.ts)
const span = (X[X.length - 1].ts - X[0].ts) / 1e6
const sum = new Map(); for (const e of X) { const s = sum.get(e.name) ?? { n: 0, ms: 0 }; s.n++; s.ms += (e.dur ?? 0) / 1000; sum.set(e.name, s) }
console.log(`главный поток, ${span.toFixed(1)} с трассы; мс на секунду (число в секунду):`)
for (const n of ['RunTask', 'FireAnimationFrame', 'FunctionCall', 'TimerFire', 'EventDispatch', 'UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'Layerize', 'Commit', 'HitTest', 'MinorGC', 'MajorGC', 'IntersectionObserverController::computeIntersections', 'Animation']) { const s = sum.get(n); if (s) console.log(`  ${n.padEnd(22)} ${(s.ms / span).toFixed(1).padStart(7)} мс/с  (${(s.n / span).toFixed(0)}/с, в среднем ${(s.ms / s.n).toFixed(2)} мс)`) }
const js = X.filter(e => e.name === 'FunctionCall' || e.name === 'FireAnimationFrame' || e.name === 'TimerFire' || e.name === 'EventDispatch')
const inside = e => js.some(j => j.ts <= e.ts && j.ts + j.dur >= e.ts + (e.dur ?? 0))
for (const kind of ['UpdateLayoutTree', 'Layout']) {
  const all = X.filter(e => e.name === kind), forced = all.filter(inside), by = new Map()
  const els = all.map(e => e.args?.elementCount ?? 0)
  console.log(`\n${kind}: всего ${(all.length / span).toFixed(0)}/с, из них вынужденных (внутри скрипта) ${(forced.length / span).toFixed(0)}/с — ${(forced.reduce((a, e) => a + e.dur, 0) / 1000 / span).toFixed(1)} мс/с из ${(all.reduce((a, e) => a + e.dur, 0) / 1000 / span).toFixed(1)}${kind === 'UpdateLayoutTree' ? `; элементов за пересчёт: в среднем ${(els.reduce((a, b) => a + b, 0) / (els.length || 1)).toFixed(1)}, максимум ${Math.max(0, ...els)}` : ''}`)
  for (const e of forced) { const st = e.args?.beginData?.stackTrace ?? e.args?.beginData?.stack ?? [], f = st[0], key = f ? `${f.functionName || '(anon)'} ${String(f.url).split('/').pop()}:${f.lineNumber}` : '(нет стека)'; const s = by.get(key) ?? { n: 0, ms: 0, up: st.slice(1, 4).map(x => x.functionName || '(anon)').join(' ← ') }; s.n++; s.ms += e.dur / 1000; by.set(key, s) }
  for (const [k, s] of [...by].sort((a, b) => b[1].ms - a[1].ms).slice(0, 12)) console.log(`  ${(s.ms / span).toFixed(1).padStart(6)} мс/с  ${(s.n / span).toFixed(0).padStart(4)}/с  ${k}  ← ${s.up}`)
}
const nodes = new Map(), self = new Map()
for (const e of ev) {
  if (e.name !== 'ProfileChunk' || `${e.pid}:${e.tid}` !== main && !(e.args?.data?.cpuProfile)) continue
  const d = e.args.data; for (const n of d.cpuProfile?.nodes ?? []) nodes.set(n.id, n.callFrame)
  const s = d.cpuProfile?.samples ?? [], dt = d.timeDeltas ?? []
  s.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (dt[i] ?? 0)))
}
const fn = new Map(); let total = 0
for (const [id, us] of self) { const c = nodes.get(id); if (!c) continue; const key = `${c.functionName || '(anon)'} ${String(c.url ?? '').split('/').pop()}:${c.lineNumber ?? ''}`; fn.set(key, (fn.get(key) ?? 0) + us); total += us }
console.log(`\nПрофиль V8 (собственное время, мс/с; всего ${(total / 1000 / span).toFixed(0)}):`)
for (const [k, us] of [...fn].sort((a, b) => b[1] - a[1]).slice(0, 28)) console.log(`  ${(us / 1000 / span).toFixed(1).padStart(6)}  ${k}`)
