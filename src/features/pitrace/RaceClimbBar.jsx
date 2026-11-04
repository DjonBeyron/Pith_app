import { useEffect, useState } from 'react'
import { leftMs, barFraction, CLIMB_BONUS_MS } from './raceClimbTimer.js'

// Общий таймер «Вершины» (raceClimbTimer.js, стили — styles/player/modules/race-climb-timer.css): полоска сверху экрана и секунды. Старт 12 с, за каждую взятую ступень +5 с (всплывает «+5»).
// Часы идут только пока подъём идёт (таймер стартовал, вершины и «времени вышло» нет): раз в 200 мс обновляется состояние, полоска плавно сходит CSS-переходом. Таймер на ступенях не показывается — он один.
const TICK_MS = 200
const LOW = 0.25 // доля полоски, ниже которой она краснеет

export default function RaceClimbBar({ climb }) {
  const [now, setNow] = useState(() => performance.now())
  const c = climb ?? { t0: null, wins: 0, top: false, timedOut: false }
  const running = c.t0 != null && !c.top && !c.timedOut
  useEffect(() => {
    if (!running) return undefined
    const id = setInterval(() => setNow(performance.now()), TICK_MS)
    return () => clearInterval(id)
  }, [running])
  const f = c.timedOut ? 0 : barFraction(c, now)
  const sec = c.timedOut ? 0 : Math.ceil(leftMs(c, now) / 1000)
  return (
    <div className="raceTimer" data-testid="race-timer" data-low={f < LOW || undefined} data-off={!running || undefined} style={{ '--f': f.toFixed(3) }}>
      <div className="raceTimerTrack"><i className="raceTimerFill" /></div>
      <span className="raceTimerSec" data-testid="race-timer-sec">{sec}</span>
      {c.wins > 0 && running && <span key={c.wins} className="raceTimerBonus" data-testid="race-timer-bonus">+{CLIMB_BONUS_MS / 1000}</span>}
    </div>
  )
}
