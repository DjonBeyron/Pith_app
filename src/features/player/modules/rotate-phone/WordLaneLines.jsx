import { useEffect, useRef } from 'react'
import { LINE_START_Y, SLOT_COUNT, frontAtListen, stepSpeakFront, kickBack, pillProgress } from './wordLaneTimeline.js'

// Горизонтальная линия игры «Повтори за диктором»: поднимается снизу из-за экрана на всю ширину, прямая. Её положение (--front, % высоты) и заливка пилюль (--p0…--p2, 0…1)
// пишутся прямо в style сцены каждый кадр (rAF) — React на кадры не перерисовывается, а заливка пилюли = «то, что линия уже прошла» (pillProgress), поэтому они двигаются как одно целое.
//  listen — голова идёт по плану (frontAtListen): вход в пилюлю = начало слова диктора, верх пилюли = конец слова, значит скорость линии = скорость речи диктора;
//  speak  — голова подчиняется ученику (stepSpeakFront): ждёт у нижнего края пустой пилюли, принятое слово — рывок сквозь пилюлю, чужое слово — отшатывание вниз.
//  turn   — линия ушла: значения сбрасываются, пилюли плавно пустеют (CSS-переход только в этой фазе, word-lane.css).
export default function WordLaneLines({ phase, phaseAt, hits, misses, anchors }) {
  const ref = useRef(null)
  const live = useRef({ hits, misses })
  useEffect(() => { live.current = { hits, misses } })

  useEffect(() => {
    const el = ref.current
    const stage = el?.parentElement // переменные читают линия, пилюли и отладочная голова — они лежат в этой же сцене
    if (!stage) return undefined
    const paint = y => {
      stage.style.setProperty('--front', `${y.toFixed(2)}%`)
      for (let k = 0; k < SLOT_COUNT; k++) stage.style.setProperty(`--p${k}`, pillProgress(y, k).toFixed(3))
    }
    if (phase === 'turn') { paint(LINE_START_Y); return undefined }
    if (phase !== 'listen' && phase !== 'speak') return undefined
    let raf = 0
    let last = performance.now()
    let front = LINE_START_Y
    let seen = { ...live.current }
    let caughtUntil = 0
    paint(front)
    const tick = t => {
      if (phase === 'listen') front = frontAtListen(t - phaseAt, anchors)
      else {
        const cur = live.current
        if (cur.hits > seen.hits) caughtUntil = t + 900
        if (cur.misses > seen.misses) front = kickBack(front, cur.hits)
        seen = { ...cur }
        front = stepSpeakFront({ front, dt: (t - last) / 1000, hits: cur.hits, caught: t < caughtUntil })
      }
      last = t
      paint(front)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [phase, phaseAt, anchors])

  const on = phase === 'listen' || phase === 'speak'
  return <div ref={ref} className={`wlLine${on ? ' wlLine--on' : ''}`} aria-hidden="true" data-testid="wl-line" />
}
