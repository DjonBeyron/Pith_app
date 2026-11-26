// «Кадр события» по замеру perf-run.mjs: сколько длится кадр, в котором случилось событие игры, и два следующих (работа события уходит и в них) — по тем же группам, что считает трассер лагов владельца
// (lagTraceLabels.js): выезд пилюли, вопрос (Пит говорит слово), старт и конец реплики, смена стадии, ответы. Для каждой группы — сколько событий, медиана и максимум худшего из трёх кадров, сколько событий
// с кадром длиннее 24 / 33 / 50 мс и «лишнее время» (сумма превышений над 16,7 мс). Несколько файлов одного профиля складываются (через запятую); два аргумента — «до → после».
//   node _stand/race/perf-events.mjs before/n4.json[,before/n4b.json] [after/n4.json[,…]]
import { readFileSync } from 'node:fs'

const GROUP = { pill: 'выезд пилюли', ask: 'вопрос (Пит говорит слово)', 'line-start': 'старт реплики', 'line-end': 'конец реплики', 'stage-in': 'смена стадии', claim: 'слово принято', count: 'отсчёт' }
const nameOf = e => GROUP[e.k] ?? (e.k === 'answer' && e.idx !== 'box' ? `ответ: ${{ win: 'верно', miss: 'чужое слово', fail: 'не успел' }[e.res] ?? e.res}` : null)
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] }

export function eventFrames(files) {
  const by = new Map()
  for (const file of files) {
    const { perf, log } = JSON.parse(readFileSync(file, 'utf8')), f = perf.f
    const skipped = (a, b) => perf.skip.some(([s0, s1]) => a < s1 && b > s0)
    let i = 1
    for (const [, text] of log) {
      const at = text.indexOf('[scene] '); if (at < 0) continue
      let e; try { e = JSON.parse(text.slice(at + 8)) } catch { continue }
      const g = nameOf(e); if (!g || !(e.t > 0)) continue
      while (i < f.length && f[i] <= e.t) i++ // f[i − 1] ≤ t < f[i]: событие случилось в кадре i − 1 → i
      if (i >= f.length) break
      const d = []; for (let j = i; j < Math.min(f.length, i + 3); j++) if (!skipped(f[j - 1], f[j])) d.push(f[j] - f[j - 1])
      if (!d.length) continue
      if (!by.has(g)) by.set(g, [])
      by.get(g).push({ worst: Math.max(...d), extra: d.reduce((s, x) => s + Math.max(0, x - 16.9), 0) })
    }
  }
  return new Map([...by].map(([g, a]) => [g, { n: a.length, med: pct(a.map(x => x.worst), 0.5), p90: pct(a.map(x => x.worst), 0.9), max: Math.max(...a.map(x => x.worst)), o24: a.filter(x => x.worst > 24).length, o33: a.filter(x => x.worst > 34).length, o50: a.filter(x => x.worst > 51).length, extra: a.reduce((s, x) => s + x.extra, 0) }]))
}

const args = process.argv.slice(2).map(a => a.split(','))
if (args.length) {
  const [A, B] = args.map(eventFrames), r = n => Math.round(n)
  const cell = x => (x ? `${x.n} соб.: худший кадр медиана ${r(x.med)} / 90 % ${r(x.p90)} / макс ${r(x.max)} мс; с кадром > 24 мс ${x.o24}, > 33 мс ${x.o33}, > 50 мс ${x.o50}; лишних ${r(x.extra)} мс` : '—')
  console.log(`# ${args.map(a => a.join(' + ')).join(' → ')}`)
  for (const g of new Set([...A.keys(), ...(B?.keys() ?? [])])) console.log(`${g}\n  ${B ? 'до:    ' : ''}${cell(A.get(g))}${B ? `\n  после: ${cell(B.get(g))}` : ''}`)
}
