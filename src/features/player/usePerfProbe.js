import { useEffect, useState } from 'react'
import { pLog } from '../../shared/lib/debug.js'
import { samplePerf } from './perfProbeSample.js'

// Датчик производительности плеера: раз в секунду пишет в pLog строку
// «[perf] …» (см. perfProbeSample.js) и отдаёт короткую сводку для строки на
// экране. FPS и просадки меряем сами через rAF, а не PerformanceObserver
// 'longtask' — в Safari его нет, а именно iPhone тут главный пациент.
//
// Включается только вместе с диагностическим набором (useShowDebugUi): у
// обычного ученика цикл rAF не крутится — сам датчик не должен становиться
// тем, что он ищет.
export function usePerfProbe(enabled) {
  const [summary, setSummary] = useState('')

  useEffect(() => {
    if (!enabled) return
    let frames = 0, worst = 0, drops = 0
    let last = performance.now()
    let raf = 0
    let alive = true

    const onFrame = now => {
      if (!alive) return
      const gap = now - last
      last = now
      frames++
      if (gap > worst) worst = gap
      // >50мс между кадрами = не меньше трёх пропущенных при 60fps —
      // считаем как «фриз», их число говорит больше, чем средний fps
      if (gap > 50) drops++
      raf = requestAnimationFrame(onFrame)
    }
    raf = requestAnimationFrame(onFrame)

    const timer = setInterval(() => {
      const line = samplePerf({ fps: frames, worstMs: Math.round(worst), drops })
      pLog(line)
      setSummary(`fps ${frames} · worst ${Math.round(worst)}ms · ${line.match(/anim=\S+ inf=\d+/)?.[0] ?? ''}`)
      frames = 0; worst = 0; drops = 0
    }, 1000)

    pLog('[perf] probe start')
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      clearInterval(timer)
      pLog('[perf] probe stop')
    }
  }, [enabled])

  return summary
}
