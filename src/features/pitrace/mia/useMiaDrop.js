import { useEffect, useState } from 'react'

// Коробка Мии на церемонии финала упала на Пита (m.at — момент падения по часам performance.now, ставит машина при входе в стадию): от этого момента дорожки начинают желтеть.
// Один раз на заход (m.seq растёт на каждом входе): повторный вход после паузы начинает заново.
export function useMiaDrop(m) {
  const [armed, setArmed] = useState(null)
  const seq = m?.seq, at = m?.at, on = m?.phase === 'in'
  useEffect(() => {
    if (!on) return undefined
    const t = setTimeout(() => setArmed(seq), Math.max(0, (at ?? 0) - performance.now()))
    return () => clearTimeout(t)
  }, [on, seq, at])
  return on && armed === seq
}
