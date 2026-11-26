// Разбор трассы Chromium (perf-run.mjs, TRACE=стадия) по ПОКРАСКЕ: журнал слабого Android (2026-11-26) показал, что в длинных кадрах скрипт и стили занимают около четверти времени, остальное — покраска, слои и растеризация,
// а троттлинг CPU стенда их почти не замедляет. Поэтому цена покраски считается не по длине кадра, а по работе: сколько мс в секунду главный поток тратит на Paint / PrePaint / Layerize / Commit, сколько раз в секунду
// и какой площадью перекрашиваются слои (Paint: clip → площадь, px²), сколько работают потоки растеризации (RasterTask) и GPU. Чем меньше площадь перекраски и время растеризации — тем легче слабому GPU.
//   node _stand/race/perf-paint.mjs OUT/NAME-trace-sprint.json [OUT2/NAME-trace-sprint.json]
import { readFileSync } from 'node:fs'

export function paintStats(file) {
  const { traceEvents: ev } = JSON.parse(readFileSync(file, 'utf8'))
  const names = new Map(); for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args.name)
  const count = new Map(); for (const e of ev) if (e.ph === 'X' && names.get(`${e.pid}:${e.tid}`) === 'CrRendererMain') count.set(`${e.pid}:${e.tid}`, (count.get(`${e.pid}:${e.tid}`) ?? 0) + 1)
  const main = [...count].sort((a, b) => b[1] - a[1])[0]?.[0], pid = main?.split(':')[0]
  const X = ev.filter(e => e.ph === 'X' && `${e.pid}:${e.tid}` === main)
  const t0 = Math.min(...X.map(e => e.ts)), t1 = Math.max(...X.map(e => e.ts)), span = (t1 - t0) / 1e6
  const cpu = e => e.tdur ?? e.dur ?? 0 // время потока (tdur), а не часы: соседняя нагрузка на машине не искажает сравнение прогонов
  const per = n => { const a = X.filter(e => e.name === n); return { n: a.length / span, ms: a.reduce((s, e) => s + cpu(e), 0) / 1000 / span } }
  const out = { span, main: Object.fromEntries(['UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'Layerize', 'Commit', 'UpdateLayer', 'CompositeLayers'].map(n => [n, per(n)])) }
  const ult = X.filter(e => e.name === 'UpdateLayoutTree'), els = ult.map(e => e.args?.elementCount ?? 0)
  out.els = els.reduce((a, b) => a + b, 0) / span; out.big = els.filter(n => n >= 100).length / span // пересчитано элементов в секунду и пересчётов «всего поля» (≥ 100 элементов) в секунду: от нагрузки на машину не зависят
  // площадь перекраски: у Paint в args.data.clip — четыре угла прямоугольника (8 чисел)
  const areas = new Map(); let area = 0, paints = 0
  for (const e of X) {
    if (e.name !== 'Paint') continue
    const c = e.args?.data?.clip; if (!c || c.length < 8) continue
    const w = Math.abs(c[2] - c[0]), h = Math.abs(c[7] - c[1]), a = w * h
    area += a; paints++
    const key = `${Math.round(w)}×${Math.round(h)} @${Math.round(c[0])},${Math.round(c[1])}${e.args.data.nodeName ? ` ${e.args.data.nodeName}` : ''}`
    const s = areas.get(key) ?? { n: 0, ms: 0, a }; s.n++; s.ms += (e.dur ?? 0) / 1000; areas.set(key, s)
  }
  out.area = area / span; out.paints = paints / span
  out.top = [...areas].sort((a, b) => b[1].n * b[1].a - a[1].n * a[1].a).slice(0, 14).map(([k, s]) => ({ k, n: s.n / span, ms: s.ms / span, mpx: (s.n * s.a) / span / 1e6 }))
  // растеризация и GPU: все потоки процесса страницы и процесса GPU
  const other = new Map()
  for (const e of ev) {
    if (e.ph !== 'X' || !['RasterTask', 'ImageDecodeTask', 'GPUTask', 'Decode Image', 'DrawFrame'].includes(e.name)) continue
    if (e.name !== 'GPUTask' && String(e.pid) !== pid) continue
    if (e.ts < t0 || e.ts > t1) continue
    const s = other.get(e.name) ?? { n: 0, ms: 0 }; s.n++; s.ms += cpu(e) / 1000; other.set(e.name, s)
  }
  out.other = Object.fromEntries([...other].map(([k, s]) => [k, { n: s.n / span, ms: s.ms / span }]))
  // сколько слоёв: последнее дерево слоёв, если трасса его несёт (cc), иначе — число разных layerId у Paint
  out.layers = new Set(X.filter(e => e.name === 'Paint').map(e => e.args?.data?.layerId)).size
  return out
}

const files = process.argv.slice(2)
if (files.length) {
  const [A, B] = files.map(paintStats), f = (x, d = 1) => (x == null ? '—' : x.toFixed(d))
  const two = (a, b, d = 1) => (B ? `${f(a, d)} → ${f(b, d)}` : f(a, d))
  console.log(`# ${files.join(' → ')}; трасса ${two(A.span, B?.span)} с`)
  console.log('главный поток, мс на секунду (раз в секунду):')
  for (const n of Object.keys(A.main)) if (A.main[n].n || B?.main[n].n) console.log(`  ${n.padEnd(18)} ${two(A.main[n].ms, B?.main[n].ms)}  (${two(A.main[n].n, B?.main[n].n, 0)}/с)`)
  console.log(`пересчёт стилей: ${two(A.els, B?.els, 0)} элементов/с, пересчётов ≥ 100 элементов ${two(A.big, B?.big, 2)}/с`)
  console.log(`перекраска: ${two(A.paints, B?.paints, 0)} Paint/с`)
  for (const n of new Set([...Object.keys(A.other), ...Object.keys(B?.other ?? {})])) console.log(`  ${n.padEnd(18)} ${two(A.other[n]?.ms, B?.other[n]?.ms)} мс/с  (${two(A.other[n]?.n, B?.other[n]?.n, 0)}/с)`)
  for (const [X, tag] of [[A, B ? 'до' : ''], [B, 'после']]) { if (!X) continue; console.log(`что перекрашивается ${tag} (размер @место: раз/с, Мпикс/с, мс/с):`); for (const t of X.top) console.log(`  ${t.k.padEnd(40)} ${f(t.n).padStart(6)}/с ${f(t.mpx, 3).padStart(7)} ${f(t.ms, 2).padStart(6)}`) }
}
