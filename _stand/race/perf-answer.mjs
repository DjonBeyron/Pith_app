// Окно верного ответа (улёт пилюли) по замеру perf-run.mjs: для каждого «[scene] … answer win» берётся окно [−50 мс … +LEN мс] (LEN по умолчанию 1300 — покрывает и простой улёт, и обычный 180 + 750 мс), по кадрам rAF считаются:
// худший кадр, число кадров > 24 / 33 / 50 мс, «лишнее время» (сумма превышений над 16,7 мс). Сводка по всем окнам: медиана худшего кадра, суммарные счётчики. Несколько файлов — строка на файл (сравнение «до / после»).
//   LEN=1300 node _stand/race/perf-answer.mjs OUT/a.json [OUT/b.json …]
import { readFileSync } from 'node:fs'

const LEN = Number(process.env.LEN || 1300), r1 = n => Math.round(n * 10) / 10
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0 }
for (const file of process.argv.slice(2)) {
  const { perf, log, cfg, layers = [] } = JSON.parse(readFileSync(file, 'utf8')), wins = []
  for (const [t, x] of log) if (/"k":"answer","res":"win"/.test(x)) wins.push(t)
  const ws = wins.map(t => {
    const d = []
    for (let i = 1; i < perf.f.length; i++) { const b = perf.f[i]; if (b > t - 50 && b <= t + LEN && !perf.skip.some(([s0, s1]) => perf.f[i - 1] < s1 && b > s0)) d.push(b - perf.f[i - 1]) }
    const L = layers.filter(([lt]) => lt > t - 50 && lt <= t + LEN)
    return { lay: Math.max(0, ...L.map(l => l[2])), area: Math.max(0, ...L.map(l => l[3])), worst: Math.max(0, ...d), n: d.length, o24: d.filter(x => x > 24).length, o33: d.filter(x => x > 33).length, o50: d.filter(x => x > 50).length, extra: d.reduce((a, x) => a + Math.max(0, x - 16.7), 0) }
  })
  const sum = k => ws.reduce((s, w) => s + w[k], 0)
  console.log(`${file.split('/').slice(-1)[0].padEnd(14)} ${JSON.stringify({ CPU: cfg.CPU, WEAK: cfg.WEAK })} окон ${ws.length}: медиана худшего ${r1(med(ws.map(w => w.worst)))} мс, макс ${r1(Math.max(0, ...ws.map(w => w.worst)))} мс, > 24: ${sum('o24')}, > 33: ${sum('o33')}, > 50: ${sum('o50')}, лишнее всего ${Math.round(sum('extra'))} мс (на окно ${Math.round(sum('extra') / (ws.length || 1))}), кадров ${sum('n')}${layers.length ? `; слоёв с содержимым в окне: макс ${Math.max(0, ...ws.map(w => w.lay))}, медиана ${med(ws.map(w => w.lay))}, площадь макс ${Math.max(0, ...ws.map(w => w.area))} px²` : ''}`)
  if (process.env.V === '1') for (const w of ws) console.log('   ', r1(w.worst), w.o24, w.o33, w.o50, Math.round(w.extra))
}
