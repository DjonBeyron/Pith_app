import { useEffect, useRef } from 'react'
import { jumpOf, heroFrames, laneOf, xOf } from './raceClimbCam.js'

// Герой «Вершины» — пилюля-альпинист цвета дорожки своего островка, всегда в одной точке экрана по вертикали (мир с островками съезжает под него, см. RaceClimb.jsx). Вся анимация — Web Animations API (raceClimbCam.heroFrames):
// внешний элемент переносит героя на дорожку нового островка (left), внутренний рисует дугу, сальто 360° и приседание (transform). Прыжок запускается, когда меняется seq состояния лестницы (взял ступень, соскользнул, дрожь);
// при монтировании ничего не играет (показывается текущее состояние), на 'time' (время вышло) тоже. lite — слабое устройство или reduced-motion: перенос с затуханием, без дуги и сальто.
export default function RaceHero({ rung, from, seq, last, lite }) {
  const move = useRef(null)
  const arc = useRef(null)
  const seen = useRef(seq) // прыжок, который был до монтирования, не повторяется
  useEffect(() => {
    if (seen.current === seq) return undefined
    seen.current = seq
    const outer = move.current, inner = arc.current
    if (!outer?.animate || !inner?.animate || last === 'time') return undefined
    const f = heroFrames(jumpOf(from, rung), lite)
    const a = outer.animate(f.move, f.options.move), b = inner.animate(f.arc, f.options.arc)
    return () => { a.cancel(); b.cancel() }
  }, [seq, from, rung, last, lite])
  return (
    <div ref={move} className="raceHero" data-lane={laneOf(rung)} style={{ left: `${(xOf(rung) * 100).toFixed(2)}%` }} data-testid="race-climber">
      <div ref={arc} className="raceHeroIn" />
    </div>
  )
}
