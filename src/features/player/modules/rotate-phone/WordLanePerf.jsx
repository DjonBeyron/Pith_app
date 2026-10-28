import { useEffect, useRef } from 'react'

// Счётчик плавности для отладки на телефоне (виден только по флагу pithy_wl_debug=1 / ?wldebug): частота кадров, самый долгий кадр, число кадров дольше 33 мс и последние «подвисания»
// с фазой игры и временем от начала фазы — по снимку экрана видно, на каком шаге (первая пилюля диктора, щелчок, старт распознавания) подлагивает. Пишет прямо в DOM, React не перерисовывается.
export default function WordLanePerf() {
  const ref = useRef(null)
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let shown = last
    const dts = []
    const stalls = []
    let slow = 0
    let worst = 0
    const tick = now => {
      const dt = now - last
      last = now
      dts.push(dt); if (dts.length > 90) dts.shift()
      worst = Math.max(worst, dt)
      if (dt > 33.5) {
        slow++
        const ph = document.querySelector('[data-testid="wl"]')?.dataset.phase ?? '?'
        stalls.push(`${ph} ${Math.round(dt)}мс`); if (stalls.length > 4) stalls.shift()
      }
      if (now - shown > 500 && ref.current) {
        shown = now
        const avg = dts.reduce((a, b) => a + b, 0) / dts.length
        ref.current.textContent = `${Math.round(1000 / avg)} к/с · макс ${Math.round(worst)} мс · >33 мс: ${slow}\n${stalls.join(' | ')}`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <div ref={ref} className="wlPerf" data-testid="wl-perf" />
}
