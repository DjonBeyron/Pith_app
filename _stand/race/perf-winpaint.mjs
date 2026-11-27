// Работа главного потока в окнах верного ответа по трассе Chromium (perf-run.mjs, TRACE=стадия; стенд кладёт в трассу метку console.timeStamp('WIN') в миг «answer win», см. perfStand.js).
// Для каждого окна [WIN −50 мс … +LEN мс] суммируется время Paint / PrePaint / Layerize / Commit / UpdateLayoutTree / Layout / скрипта (FunctionCall + FireAnimationFrame) и ищутся самые длинные задачи главного потока (RunTask).
// Сводка — на одно окно в среднем. Несколько файлов — по строке на файл («до / после»).
//   LEN=1300 node _stand/race/perf-winpaint.mjs OUT/a-trace-sprint.json [OUT/b-trace-sprint.json …]
import { readFileSync } from 'node:fs'
const LEN = Number(process.env.LEN || 1300)
const KINDS = ['Paint', 'PrePaint', 'Layerize', 'Commit', 'UpdateLayoutTree', 'Layout', 'FunctionCall', 'FireAnimationFrame']
for (const file of process.argv.slice(2)) {
  const { traceEvents: ev } = JSON.parse(readFileSync(file, 'utf8'))
  const names = new Map(); for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args.name)
  const count = new Map(); for (const e of ev) if (e.ph === 'X' && names.get(`${e.pid}:${e.tid}`) === 'CrRendererMain') count.set(`${e.pid}:${e.tid}`, (count.get(`${e.pid}:${e.tid}`) ?? 0) + 1)
  const main = [...count].sort((a, b) => b[1] - a[1])[0]?.[0]
  const X = ev.filter(e => e.ph === 'X' && `${e.pid}:${e.tid}` === main)
  const pid = main?.split(':')[0], R = ev.filter(e => e.ph === 'X' && e.name === 'RasterTask' && String(e.pid) === pid) // растеризация (потоки процесса страницы)
  const D = ev.filter(e => e.ph === 'X' && e.name === 'DirectRenderer::DrawFrame' && names.get(`${e.pid}:${e.tid}`) === 'VizCompositorThread') // сборка кадра композитором (программный рендер стенда — честный заменитель работы GPU: число и площадь слоёв, поверхности под opacity); нужна трасса с TRACE_GPU=1
  const wins = ev.filter(e => e.name === 'TimeStamp' && e.args?.data?.message === 'WIN').map(e => e.ts).sort((a, b) => a - b)
  const sum = Object.fromEntries(KINDS.map(k => [k, 0])), tasks = []
  let raster = 0, rn = 0, draw = 0, dn = 0, dmax = 0
  let n = 0
  for (const w of wins) {
    const a = w - 50e3, b = w + LEN * 1e3
    n++
    for (const e of D) if (e.ts >= a && e.ts <= b) { draw += (e.dur ?? 0) / 1000; dn++; dmax = Math.max(dmax, (e.dur ?? 0) / 1000) }
    for (const e of R) if (e.ts >= a && e.ts <= b) { raster += (e.dur ?? 0) / 1000; rn++ }
    for (const e of X) { if (e.ts < a || e.ts > b) continue; if (sum[e.name] != null) sum[e.name] += (e.dur ?? 0) / 1000; if (e.name === 'RunTask') tasks.push((e.dur ?? 0) / 1000) }
  }
  const per = k => (sum[k] / (n || 1)).toFixed(1)
  console.log(`${file.split('/').slice(-1)[0]}: окон ${n}; на окно, мс: ${KINDS.map(k => `${k} ${per(k)}`).join(', ')}; растеризация ${(raster / (n || 1)).toFixed(1)} мс (${(rn / (n || 1)).toFixed(0)} задач) на окно; композитор (DrawFrame): ${(draw / (n || 1)).toFixed(1)} мс (${(dn / (n || 1)).toFixed(0)} кадров, самый долгий ${dmax.toFixed(1)}) на окно; задач > 8 мс: ${tasks.filter(t => t > 8).length}, > 16 мс: ${tasks.filter(t => t > 16).length}, самая длинная ${Math.max(0, ...tasks).toFixed(1)} мс`)
}
