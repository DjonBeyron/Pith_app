// Сводка замера perf-run.mjs: таблица по этапам игры (средний кадр, 95-й процентиль, кадров > 33 и > 50 мс, длинные задачи, вызовы rAF в секунду и число циклов, анимации, узлы, куча, время главного потока
// на скрипт / стили / раскладку) и покадровая картина момента ответа (верно / чужое слово / не успел). Два файла — таблица «до → после».
//   node _stand/race/perf-report.mjs before/n4.json [after/n4.json]
import { readFileSync } from 'node:fs'

const GROUPS = { 'sprint-ann': 'Старт', sprint: 'Конвейер слов A', 'catch-rev': 'Разворот', 'catch-ann': 'Разворот', catch: 'Конвейер слов B', 'phrases-sw': '«Скажи»', 'phrases-ann': '«Скажи»', phrases2: '«Скажи»', 'boss-ann': 'Экзамен: церемония', boss: 'Экзамен: круг', 'boss-sw': 'Экзамен: круг', boss2: 'Экзамен: круг', 'boss-end': 'Экзамен: концовка', summary: 'Итог' }
export const groupOf = sid => (sid == null ? null : /-intro-ann$|3-ann$/.test(sid) ? 'Допрос: церемония' : /3-end$/.test(sid) ? 'Допрос: концовка' : /3$/.test(sid) ? 'Допрос: круг' : GROUPS[sid] ?? sid)
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] }
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
const r1 = n => Math.round(n * 10) / 10

export function analyse(file) {
  const { cfg, perf, log, metrics } = JSON.parse(readFileSync(file, 'utf8'))
  const ev = []
  for (const [, text] of log) { const i = text.indexOf('[scene] '); if (i < 0) continue; try { ev.push(JSON.parse(text.slice(i + 8))) } catch { /* обрезано */ } }
  const stages = ev.filter(e => e.k === 'stage-in').map(e => ({ t: e.t, sid: e.sid, g: groupOf(e.sid) }))
  const endT = perf.f[perf.f.length - 1]
  const spans = stages.map((s, i) => ({ ...s, to: stages[i + 1]?.t ?? endT }))
  const gOf = t => { for (let i = spans.length - 1; i >= 0; i--) if (t >= spans[i].t) return t < spans[i].to ? spans[i].g : null; return null }
  const skipped = (a, b) => perf.skip.some(([s0, s1]) => a < s1 && b > s0)
  const by = new Map()
  const row = g => { if (!by.has(g)) by.set(g, { g, dts: [], secs: 0, lt: [], raf: 0, rafMs: 0, frames: 0, run: [], inf: [], names: {}, an: [], wl: [], out: [], heap: [], script: 0, style: 0, layout: 0, task: 0, mMs: 0, logN: 0 }); return by.get(g) }
  for (const s of spans) row(s.g).secs += (s.to - s.t) / 1000
  for (let i = 1; i < perf.f.length; i++) { const a = perf.f[i - 1], b = perf.f[i], g = gOf(b); if (!g) continue; row(g).frames++; if (!skipped(a, b)) row(g).dts.push(b - a) }
  for (const [t, d] of perf.lt) { const g = gOf(t); if (g && !skipped(t, t + d)) row(g).lt.push(d) }
  for (let i = 1; i < perf.sec.length; i++) {
    const a = perf.sec[i - 1], b = perf.sec[i], g = gOf(b.t); if (!g || gOf(a.t) !== g) continue
    const r = row(g); r.raf += b.raf - a.raf; r.rafMs += b.t - a.t; r.logN += b.logN - a.logN
    r.run.push(b.run); r.inf.push(b.inf); r.an.push(b.an); r.wl.push(b.wl); r.out.push(b.out); r.heap.push(b.heap / 1048576)
    for (const [n, c] of Object.entries(b.names)) r.names[n] = Math.max(r.names[n] ?? 0, c)
  }
  for (let i = 1; i < metrics.length; i++) { // счётчики главного потока: интервал между сменами стадий относится к стадии, которая шла (metrics[i - 1].sid)
    const a = metrics[i - 1], b = metrics[i], g = groupOf(a.sid); if (!g || !by.has(g)) continue
    const r = row(g); r.script += b.m.ScriptDuration - a.m.ScriptDuration; r.style += b.m.RecalcStyleDuration - a.m.RecalcStyleDuration; r.layout += b.m.LayoutDuration - a.m.LayoutDuration; r.task += b.m.TaskDuration - a.m.TaskDuration; r.mMs += b.at - a.at
  }
  const rows = [...by.values()].map(r => {
    const fps = r.rafMs ? r.frames / r.secs : 0, rafS = r.rafMs ? r.raf / (r.rafMs / 1000) : 0
    return { g: r.g, secs: r1(r.secs), avg: r1(avg(r.dts)), p95: r1(pct(r.dts, 0.95)), max: r1(Math.max(0, ...r.dts)), n33: r.dts.filter(d => d > 33.4).length, n50: r.dts.filter(d => d > 50).length, lt: r.lt.length, ltMs: Math.round(r.lt.reduce((x, y) => x + y, 0)),
      rafS: Math.round(rafS), loops: r1(fps ? rafS / fps : 0), run: r1(avg(r.run)), inf: Math.max(0, ...r.inf), names: Object.entries(r.names).map(([n, c]) => `${n}:${c}`).join(','), wl: Math.round(avg(r.wl)), out: Math.round(avg(r.out)), heap: r1(avg(r.heap)),
      script: r.mMs ? Math.round(r.script * 1e6 / r.mMs) : 0, style: r.mMs ? Math.round(r.style * 1e6 / r.mMs) : 0, layout: r.mMs ? Math.round(r.layout * 1e6 / r.mMs) : 0, task: r.mMs ? Math.round(r.task * 1e6 / r.mMs) : 0, logS: r1(r.rafMs ? r.logN / (r.rafMs / 1000) : 0) }
  })
  const all = []; for (let i = 1; i < perf.f.length; i++) { const a = perf.f[i - 1], b = perf.f[i]; if (gOf(b) && gOf(b) !== 'Итог' && !skipped(a, b)) all.push(b - a) }
  const total = { avg: r1(avg(all)), p95: r1(pct(all, 0.95)), p99: r1(pct(all, 0.99)), n33: all.filter(d => d > 33.4).length, n50: all.filter(d => d > 50).length, frames: all.length }
  const answers = {}
  for (const e of ev.filter(x => x.k === 'answer' && x.idx !== 'box')) {
    const fr = []; for (let i = 1; i < perf.f.length; i++) { const b = perf.f[i]; if (b < e.t - 34) continue; if (b > e.t + 400) break; fr.push(r1(b - perf.f[i - 1])) }
    const a = answers[e.res] ??= { n: 0, worst: [], bad33: 0, bad50: 0, sample: null }
    a.n++; a.worst.push(Math.max(0, ...fr)); if (fr.some(d => d > 33.4)) a.bad33++; if (fr.some(d => d > 50)) a.bad50++; if (!a.sample || Math.max(...fr) > Math.max(...a.sample)) a.sample = fr
  }
  const last = metrics[metrics.length - 1]?.m ?? {}
  return { cfg, rows, total, answers, end: { nodes: last.Nodes, listeners: last.JSEventListeners, heapMB: r1((last.JSHeapUsedSize ?? 0) / 1048576) } }
}

const files = process.argv.slice(2)
if (files.length) {
  const A = analyse(files[0]), B = files[1] ? analyse(files[1]) : null
  const two = (a, b) => (B ? `${a} → ${b ?? '—'}` : String(a))
  console.log(`# ${files.join(' → ')}\nнастройки: ${JSON.stringify(A.cfg)}${B ? ` → ${JSON.stringify(B.cfg)}` : ''}\n`)
  console.log('| этап | с | средний кадр, мс | 95 %, мс | макс, мс | кадров > 33 мс | > 50 мс | длинных задач (мс) | rAF/с (циклов) | анимаций идёт (бесконечных) | узлов игры / под ней | скрипт / стили / раскладка, мс на секунду |')
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const a of A.rows) {
    const b = B?.rows.find(x => x.g === a.g)
    console.log(`| ${a.g} | ${two(a.secs, b?.secs)} | ${two(a.avg, b?.avg)} | ${two(a.p95, b?.p95)} | ${two(a.max, b?.max)} | ${two(a.n33, b?.n33)} | ${two(a.n50, b?.n50)} | ${two(`${a.lt} (${a.ltMs})`, b && `${b.lt} (${b.ltMs})`)} | ${two(`${a.rafS} (${a.loops})`, b && `${b.rafS} (${b.loops})`)} | ${two(`${a.run} (${a.inf})`, b && `${b.run} (${b.inf})`)} | ${two(`${a.wl} / ${a.out}`, b && `${b.wl} / ${b.out}`)} | ${two(`${a.script} / ${a.style} / ${a.layout}`, b && `${b.script} / ${b.style} / ${b.layout}`)} |`)
  }
  console.log(`\nВся игра без итога: средний кадр ${two(A.total.avg, B?.total.avg)} мс, 95 % ${two(A.total.p95, B?.total.p95)}, 99 % ${two(A.total.p99, B?.total.p99)}, кадров > 33 мс ${two(A.total.n33, B?.total.n33)}, > 50 мс ${two(A.total.n50, B?.total.n50)} из ${two(A.total.frames, B?.total.frames)}`)
  console.log(`В конце: узлов ${two(A.end.nodes, B?.end.nodes)}, слушателей ${two(A.end.listeners, B?.end.listeners)}, куча ${two(A.end.heapMB, B?.end.heapMB)} МБ`)
  console.log(`Бесконечные анимации по этапам: ${A.rows.filter(r => r.names).map(r => `${r.g}: ${r.names}`).join('; ') || '—'}${B ? `\n  после: ${B.rows.filter(r => r.names).map(r => `${r.g}: ${r.names}`).join('; ') || '—'}` : ''}`)
  console.log(`Строк журнала в секунду: ${A.rows.map(r => `${r.g} ${r.logS}`).join('; ')}`)
  for (const [X, tag] of [[A, 'до'], [B, 'после']]) {
    if (!X) continue
    console.log(`\nМомент ответа (${B ? tag : 'замер'}; окно −34…+400 мс от события):`)
    for (const [res, a] of Object.entries(X.answers)) console.log(`  ${{ win: 'верно', miss: 'чужое слово', fail: 'не успел' }[res] ?? res}: ответов ${a.n}, худший кадр — медиана ${r1(pct(a.worst, 0.5))} мс, максимум ${Math.max(...a.worst)} мс; с кадром > 33 мс ${a.bad33}, > 50 мс ${a.bad50}; худшая серия кадров: ${a.sample.join(' ')}`)
  }
}
