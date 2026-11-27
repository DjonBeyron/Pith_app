// Что за слои держит страница в миг верного ответа (прогон perf-run.mjs с LAYERS=1): для каждого окна «answer win» (−50 … +LEN мс) берётся изменение дерева слоёв с наибольшим числом слоёв, рисующих содержимое;
// слои группируются по владельцу (тег.класс узла) — сколько штук и какая у них площадь (CSS px²). Так видно, сколько слоёв у одной летящей пилюли и что из них лишнее.
//   LEN=1300 node _stand/race/perf-layers.mjs OUT/a.json
import { readFileSync } from 'node:fs'
const LEN = Number(process.env.LEN || 1300)
const { log, layers, layerNames } = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const wins = log.filter(([, x]) => /"k":"answer","res":"win"/.test(x)).map(l => l[0])
const tot = new Map(), best = []
for (const t of wins) {
  const W = layers.filter(l => l[0] > t - 50 && l[0] <= t + LEN).sort((a, b) => b[2] - a[2])[0]
  if (!W) continue
  best.push(W[2])
  const g = new Map()
  for (const [id, w, h, d] of W[4]) { if (!d) continue; const k = layerNames[id] ?? (id ? '?' : '(без узла: псевдоэлемент / корень)'); const s = g.get(k) ?? { n: 0, a: 0 }; s.n++; s.a += w * h; g.set(k, s) }
  for (const [k, s] of g) { const o = tot.get(k) ?? { n: 0, a: 0 }; o.n += s.n / wins.length; o.a += s.a / wins.length; tot.set(k, o) }
}
console.log(`окон ${wins.length}, слоёв с содержимым в пике окна: ${best.join(' ')}`)
console.log('в среднем за окно (штук, px²) по владельцу слоя:')
for (const [k, s] of [...tot].sort((a, b) => b[1].a - a[1].a).slice(0, 25)) console.log(`  ${s.n.toFixed(1).padStart(5)}  ${String(Math.round(s.a)).padStart(8)}  ${k.slice(0, 90)}`)
