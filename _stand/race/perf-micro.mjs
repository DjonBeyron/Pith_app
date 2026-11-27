// Микро-фризы возле пилюль по замеру perf-run.mjs (то же, что строка «[micro]» в приложении, microFreeze.js): для каждого события «[scene]» pill (выезд) / answer win (улёт) / claim (слово принято)
// берётся окно [−100 … +500 мс]; по кадрам rAF считается число окон с кадром ≥ 25 мс и число кадров ≥ 25 / 34 / 50 мс; отдельно — доля кадров ≥ 25 мс ВНЕ всех окон (контроль). Несколько файлов — строка на файл.
//   node _stand/race/perf-micro.mjs OUT/a.json [OUT/b.json …]
import { readFileSync } from 'node:fs'

const PRE = 100, POST = 500, KINDS = { pill: 'выезд', gone: 'улёт', claim: 'принято' }
const kind = x => (/"k":"pill"/.test(x) ? 'pill' : /"k":"claim"/.test(x) ? 'claim' : /"k":"answer","res":"win"/.test(x) ? 'gone' : null)
for (const file of process.argv.slice(2)) {
  const { perf, log, cfg } = JSON.parse(readFileSync(file, 'utf8')), ev = []
  for (const [t, x] of log) { if (!/^\[scene\]/.test(x)) continue; const k = kind(x); if (k) ev.push({ k, t }) }
  const gaps = [] // [конец кадра, длина]; кадры внутри пауз замера (skip) и рывки > 3 с не считаем
  for (let i = 1; i < perf.f.length; i++) { const b = perf.f[i], g = b - perf.f[i - 1]; if (g > 3000 || perf.skip.some(([s0, s1]) => perf.f[i - 1] < s1 && b > s0)) continue; gaps.push([b, g]) }
  const inWin = ([b]) => ev.some(e => b >= e.t - PRE && b <= e.t + POST)
  const out = gaps.filter(g => !inWin(g)), outBad = out.filter(g => g[1] >= 25).length
  const per = {}
  for (const k of Object.keys(KINDS)) {
    const ws = ev.filter(e => e.k === k).map(e => { const d = gaps.filter(([b]) => b >= e.t - PRE && b <= e.t + POST).map(g => g[1]); return { c25: d.filter(x => x >= 25).length, c34: d.filter(x => x >= 34).length, c50: d.filter(x => x >= 50).length, worst: Math.max(0, ...d) } })
    per[k] = { n: ws.length, hit: ws.filter(w => w.c25).length, c25: ws.reduce((s, w) => s + w.c25, 0), c34: ws.reduce((s, w) => s + w.c34, 0), c50: ws.reduce((s, w) => s + w.c50, 0), worst: Math.round(Math.max(0, ...ws.map(w => w.worst))) }
  }
  console.log(`${file.split('/').slice(-1)[0].padEnd(12)} ${Object.entries(per).map(([k, p]) => `${KINDS[k]} ×${p.n}: окон с фризом ${p.hit} (${p.n ? Math.round(100 * p.hit / p.n) : 0}%), кадров ≥25/34/50: ${p.c25}/${p.c34}/${p.c50}, худший ${p.worst}`).join(' | ')} | вне окон: ≥25 мс ${outBad} из ${out.length} (${out.length ? (100 * outBad / out.length).toFixed(1) : 0}%) [CPU ${cfg.CPU}, weak ${cfg.WEAK}]`)
}
