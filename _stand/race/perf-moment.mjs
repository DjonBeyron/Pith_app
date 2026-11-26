// Покадровая картина названных моментов игры по замеру perf-run.mjs: приход Мии (падение коробки), её прыжок на коробку, перекраска дорожек, уход Мии с коробкой за экран.
// Момент берётся из журнала прогона: метка «[lag-mark] …» (lagTrace.js, есть в сборках с трассером лагов) или, для старых сборок, строка «[mia] …» со сдвигом. Для каждого окна — число кадров,
// худший кадр, сколько кадров длиннее 33 и 50 мс, «лишнее время» (сумма превышений над 16,7 мс) и сам ряд кадров. Два файла — «до → после».
//   node _stand/race/perf-moment.mjs before/n4.json [after/n4.json]
import { readFileSync } from 'node:fs'

const MOMENTS = [
  { name: 'Мия: коробка падает (приход)', re: /\[mia\] Мия пришла \((\w+)\), коробка падает через (\d+) мс/, at: m => Number(m[2]), len: 1300 },
  { name: 'Мия: первая реплика из-за края (дорожки желтеют, «Допрос»)', re: /\[mia\] реплика mia_push/, at: () => 0, len: 1100 },
  { name: 'Мия: прыжок на коробку и посадка', mark: /\[lag-mark\] Мия: прыжок на коробку/, re: /\[mia\] реплика (mia_announce_2|boss_mia_look)/, at: () => -900, len: 1700, markLen: 1200 },
  { name: 'Мия: уход с коробкой за экран', re: /\[mia\] Мия уходит/, at: () => 0, len: 1500 },
]
const r1 = n => Math.round(n * 10) / 10

function windows(file) {
  const { perf, log, cfg } = JSON.parse(readFileSync(file, 'utf8'))
  const out = []
  for (const mo of MOMENTS) {
    const useMark = mo.mark && log.some(([, x]) => mo.mark.test(x))
    for (const [t, text] of log) {
      const m = useMark ? text.match(mo.mark) : text.match(mo.re)
      if (!m) continue
      const from = t + (useMark ? 0 : mo.at(m)), to = from + (useMark ? mo.markLen ?? mo.len : mo.len), d = []
      for (let i = 1; i < perf.f.length; i++) { const b = perf.f[i]; if (b > from && b <= to + 17 && !perf.skip.some(([s0, s1]) => perf.f[i - 1] < s1 && b > s0)) d.push(r1(b - perf.f[i - 1])) }
      const lt = perf.lt.filter(([s, dur]) => s + dur > from && s < to).map(x => x[1])
      out.push({ name: mo.name, from: Math.round(from), n: d.length, worst: Math.max(0, ...d), o33: d.filter(x => x > 34).length, o50: d.filter(x => x > 51).length, extra: Math.round(d.reduce((a, x) => a + Math.max(0, x - 16.9), 0)), lt, d })
    }
  }
  return { cfg, out }
}

const [a, b] = process.argv.slice(2).map(windows)
const show = (w, tag) => console.log(`  ${tag} @${w.from}: кадров ${w.n}, худший ${w.worst} мс, > 33 мс: ${w.o33}, > 50 мс: ${w.o50}, лишнее время ${w.extra} мс${w.lt.length ? `, длинные задачи: ${w.lt.join(' ')}` : ''}\n      ${w.d.map(x => Math.round(x)).join(' ')}`)
console.log(`# ${process.argv[2]}${b ? ` → ${process.argv[3]}` : ''}  ${JSON.stringify(a.cfg)}`)
for (const mo of MOMENTS) {
  const A = a.out.filter(w => w.name === mo.name), B = b ? b.out.filter(w => w.name === mo.name) : []
  if (!A.length && !B.length) continue
  console.log(`\n${mo.name}`)
  for (let i = 0; i < Math.max(A.length, B.length); i++) { if (A[i]) show(A[i], b ? 'до   ' : '     '); if (B[i]) show(B[i], 'после') }
  const tot = W => `лишнее ${W.reduce((s, w) => s + w.extra, 0)} мс, кадров > 33 мс ${W.reduce((s, w) => s + w.o33, 0)}, > 50 мс ${W.reduce((s, w) => s + w.o50, 0)}, худший ${Math.max(0, ...W.map(w => w.worst))} мс`
  console.log(`  ИТОГО: ${tot(A)}${b ? ` → ${tot(B)}` : ''}`)
}
