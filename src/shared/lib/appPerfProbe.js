import { pLog } from './debug.js'
import { samplePerf } from './perfProbeSample.js'
import { installRafProbe, uninstallRafProbe, takeRafStats } from './rafProbe.js'
import { scanPerfSuspects } from './perfSuspects.js'

// Датчик производительности всего приложения (не только урока). Раз в
// секунду пишет в pLog строку «[perf] …» (состав — perfProbeSample.js), раз в
// ~10с сканирует DOM на тяжёлое для композитора (perfSuspects.js) и пишет
// «[suspects] …», когда картина изменилась, и отмечает «[vis] hidden/visible»
// — момент сворачивания приложения. Жалоба: системная анимация сворачивания
// и шторка iPhone дёргаются почти с любого экрана — значит что-то грузит
// GPU постоянно; по строкам вокруг [vis] видно, что именно крутилось.
//
// FPS и просадки меряем сами через rAF, а не PerformanceObserver 'longtask'
// — в Safari его нет, а именно iPhone тут главный пациент.
//
// Один экземпляр на приложение: start() идемпотентен, включается вместе с
// диагностическим набором (useShowDebugUi) из AppPerfProbe.jsx, урок только
// подписывается на сводку (usePerfProbe.js). У обычного ученика ничего из
// этого не крутится — сам датчик не должен становиться тем, что он ищет.
const SUSPECTS_EVERY = 10

let running = false
let summary = ''
const listeners = new Set()
let stopFn = null

function emit(next) {
  summary = next
  for (const l of listeners) l()
}

export function subscribePerfSummary(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function getPerfSummary() { return summary }
export function isPerfProbeRunning() { return running }

export function startPerfProbe() {
  if (running || typeof document === 'undefined') return
  running = true
  installRafProbe()

  let frames = 0, worst = 0, drops = 0, seconds = 0, lastSuspects = ''
  let last = performance.now()
  let raf = 0
  let alive = true

  const onFrame = now => {
    if (!alive) return
    const gap = now - last
    last = now
    frames++
    if (gap > worst) worst = gap
    // >50мс между кадрами = не меньше трёх пропущенных при 60fps — «фриз»
    if (gap > 50) drops++
    raf = requestAnimationFrame(onFrame)
  }
  raf = requestAnimationFrame(onFrame)

  const suspects = why => {
    const line = scanPerfSuspects()
    if (line === lastSuspects && why !== 'visible') return
    lastSuspects = line
    pLog(`[suspects] (${why}) ${line}`)
  }

  const timer = setInterval(() => {
    const line = samplePerf({ fps: frames, worstMs: Math.round(worst), drops, raf: takeRafStats() })
    pLog(line)
    emit(`fps ${frames} · worst ${Math.round(worst)}ms · ${line.match(/anim=\S+ inf=\d+/)?.[0] ?? ''}`)
    frames = 0; worst = 0; drops = 0
    // В фоне rAF стоит, кадры не считаются — сканировать DOM тоже незачем
    if (!document.hidden && ++seconds % SUSPECTS_EVERY === 0) suspects('tick')
  }, 1000)

  const onVis = () => {
    pLog(`[vis] ${document.hidden ? 'hidden — приложение свёрнуто' : 'visible — приложение развёрнуто'}`)
    // Момент возврата — скан того, что крутилось под сворачиванием: в самый
    // момент ухода главный поток лучше не нагружать
    if (!document.hidden) setTimeout(() => { if (alive) suspects('visible') }, 500)
  }
  const onPageHide = () => pLog('[vis] pagehide')
  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('pagehide', onPageHide)

  pLog('[perf] probe start (всё приложение)')
  setTimeout(() => { if (alive) suspects('start') }, 1500)

  stopFn = () => {
    alive = false
    running = false
    cancelAnimationFrame(raf)
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('pagehide', onPageHide)
    uninstallRafProbe()
    emit('')
    pLog('[perf] probe stop')
  }
}

export function stopPerfProbe() {
  stopFn?.()
  stopFn = null
}
