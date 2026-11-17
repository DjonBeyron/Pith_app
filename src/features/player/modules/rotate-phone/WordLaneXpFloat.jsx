import { useEffect, useRef } from 'react'
import { XP_FLOAT_MS, rectCenter, xpFloatFrames } from './WordLaneXpFlight.js'

// «+N XP» от счётчика: появляется у центра счётчика (getTarget() — .wlXp, прямоугольник берётся в момент старта), медленно поднимается по синусоиде, растёт и растворяется (xpFloatFrames).
// Кадры считаются один раз, летит компоузер (el.animate), не rAF. Кончилось — onDone (событие убирается). Нет счётчика / WAAPI — молча onDone.
export default function WordLaneXpFloat({ amount, getTarget, onDone }) {
  const elRef = useRef(null)
  useEffect(() => {
    const el = elRef.current, from = rectCenter(getTarget?.()?.getBoundingClientRect?.())
    if (!el?.animate || !from) { onDone?.(); return undefined }
    const anim = el.animate(xpFloatFrames(from), { duration: XP_FLOAT_MS, easing: 'linear', fill: 'forwards' })
    anim.onfinish = () => onDone?.()
    return () => anim.cancel()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- подъём задаётся один раз при появлении
  return (
    <div ref={elRef} className="xpFloat" style={{ position: 'fixed', top: 0, left: 0, transform: 'translate(-100px, -100px) scale(0)', opacity: 0, pointerEvents: 'none', zIndex: 9998, userSelect: 'none', willChange: 'transform, opacity' }}>
      +{amount} XP
    </div>
  )
}
