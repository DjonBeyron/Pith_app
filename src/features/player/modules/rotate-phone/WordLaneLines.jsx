import { useEffect, useRef } from 'react'
import { LANES_X, LINE_START_Y, LINE_END_Y, frontAtListen, stepSpeakFront, kickBack } from './wordLaneTimeline.js'

// Линии игры «Повтори за диктором»: три дорожки растут из-под слова и опускаются. Рисуются одним SVG в сетке 0–100 (проценты экрана, preserveAspectRatio=none, толщина не масштабируется),
// а «голова» линии — обычная маска на SVG: CSS-переменная --front (в %) двигается каждый кадр прямо в DOM, React на кадры не перерисовывается.
//  listen — голова идёт по расписанию (frontAtListen), синхронно с заливкой слоёв и голосом диктора;
//  speak  — голова подчиняется ученику (stepSpeakFront): едет к ближайшему пустому слою и стоит перед ним, принятое слово — рывок вперёд, чужое слово — отшатывание назад.
const Y0 = LINE_START_Y
const PATHS = [
  `M50 ${Y0} C50 ${Y0 + 6} ${LANES_X[0]} ${Y0 + 2} ${LANES_X[0]} ${Y0 + 9} L${LANES_X[0]} ${LINE_END_Y}`,
  `M50 ${Y0} L50 ${LINE_END_Y}`,
  `M50 ${Y0} C50 ${Y0 + 6} ${LANES_X[2]} ${Y0 + 2} ${LANES_X[2]} ${Y0 + 9} L${LANES_X[2]} ${LINE_END_Y}`,
]

export default function WordLaneLines({ phase, phaseAt, hits, misses }) {
  const ref = useRef(null)
  const live = useRef({ hits, misses })
  useEffect(() => { live.current = { hits, misses } })

  useEffect(() => {
    const el = ref.current
    if (!el || (phase !== 'listen' && phase !== 'speak')) return undefined
    const stage = el.parentElement // --front читают и маска линий, и отладочная голова (WordLaneDebug)
    const paint = y => stage.style.setProperty('--front', `${y.toFixed(2)}%`)
    let raf = 0
    let last = performance.now()
    let front = Y0
    let seen = { ...live.current }
    let caughtUntil = 0
    paint(front)
    const tick = t => {
      if (phase === 'listen') front = frontAtListen(t - phaseAt)
      else {
        const cur = live.current
        if (cur.hits > seen.hits) caughtUntil = t + 700
        if (cur.misses > seen.misses) front = kickBack(front)
        seen = { ...cur }
        front = stepSpeakFront({ front, dt: (t - last) / 1000, hits: cur.hits, caught: t < caughtUntil })
      }
      last = t
      paint(front)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [phase, phaseAt])

  const on = phase === 'listen' || phase === 'speak'
  return (
    <svg ref={ref} className={`wlLines${on ? ' wlLines--on' : ''}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" data-testid="wl-lines">
      {PATHS.map(d => <path key={d} d={d} className="wlLine" />)}
    </svg>
  )
}
