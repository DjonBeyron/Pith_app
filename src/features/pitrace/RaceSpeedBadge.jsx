import { useEffect, useRef } from 'react'
import { BADGE_MS, speedLabel, badgeShown } from './raceSpeedBadge.js'

// Бейдж скорости у верха сцены «Гонки» («×1,1 … ×1,5», стиль плашки игры; race-speed.css). Управляется ИЗВНЕ через apiRef, минуя React: apiRef.current.show(v) пишет подпись прямо в DOM и включает бейдж на BADGE_MS —
// перерисовок игры и пилюль нет (в DOM один узел). Скорость 1 — бейдж не показывается.
export default function RaceSpeedBadge({ apiRef }) {
  const ref = useRef(null)
  useEffect(() => {
    let timer = 0
    apiRef.current = {
      show(v) {
        const el = ref.current
        if (!el || !badgeShown(v)) return
        el.textContent = speedLabel(v); el.dataset.on = ''
        clearTimeout(timer); timer = setTimeout(() => el.removeAttribute('data-on'), BADGE_MS)
      },
    }
    return () => { clearTimeout(timer); apiRef.current = null }
  }, [apiRef])
  return <div ref={ref} className="raceSpeed" aria-hidden="true" data-testid="race-speed" />
}
