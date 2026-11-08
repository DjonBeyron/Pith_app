import { useEffect, useRef } from 'react'
import { XP_FLIGHT_MS, rectCenter, xpFlightFrames } from './WordLaneXpFlight.js'

// Одна летящая цифра «+N XP» игры: из центра пилюли (rect) в счётчик (getTarget() — элемент .wlXp, его прямоугольник берётся в момент старта).
// Кадры траектории считаются один раз (WordLaneXpFlight.js), летит частица на компоузере (el.animate), не rAF. Долетела — onDone (счётчик прибавляет и «дышит»).
// Нет пилюли — старт из нижней трети экрана; нет счётчика — летит прямо вверх, как прежде.
export default function WordLaneXpParticle({ amount, rect, getTarget, onDone }) {
  const elRef = useRef(null)
  useEffect(() => {
    const el = elRef.current
    if (!el?.animate) { onDone?.(); return }
    const from = rectCenter(rect) ?? { x: window.innerWidth / 2, y: window.innerHeight * 0.72 }
    const to = rectCenter(getTarget?.()?.getBoundingClientRect?.())
    const anim = el.animate(xpFlightFrames(from, to), { duration: XP_FLIGHT_MS, easing: 'linear', fill: 'forwards' })
    anim.onfinish = () => onDone?.()
    return () => anim.cancel()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- полёт задаётся один раз при появлении
  return (
    <div ref={elRef} className="xpFloat" style={{ position: 'fixed', top: 0, left: 0, transform: 'translate(-100px, -100px) scale(0)', opacity: 0, pointerEvents: 'none', zIndex: 9998, userSelect: 'none', willChange: 'transform, opacity' }}>
      +{amount} XP
    </div>
  )
}
