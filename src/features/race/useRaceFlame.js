import { useState, useEffect } from 'react'
import { fetchCurrentRace } from '../../shared/api/raceApi.js'
import { racePhase } from './useRaceState.js'
import { subscribeRaceChanged } from './raceBus.js'

// «Огонёк» над кубком в нижней панели (ShellNav.jsx): есть активная супергонка — идёт или вот-вот начнётся
// (не завершена). Одна лёгкая проверка на старте; обновляется, когда админ меняет гонку (raceBus) и когда
// приложение возвращается из фона (гонка могла начаться, пока оно спало)
export function useRaceFlame() {
  const [on, setOn] = useState(false)

  useEffect(() => {
    let alive = true
    const check = () => fetchCurrentRace()
      .then(race => { if (alive) setOn(['upcoming', 'running'].includes(racePhase(race))) })
      .catch(() => {})
    check()
    const off = subscribeRaceChanged(check)
    const onVis = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVis)
    return () => { alive = false; off(); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  return on
}
