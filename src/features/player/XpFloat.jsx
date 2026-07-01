import { useEffect, useRef } from 'react'

const DURATION   = 1600   // ms total flight time
const WAVE_AMP   = 36     // px horizontal swing amplitude
const WAVE_FREQ  = 2.5    // sine cycles during flight
// opacity/scale: rises 0→1 in first PEAK_AT, falls 1→0 in the rest
const PEAK_AT    = 0.42

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}

// Single floating XP particle driven by rAF
function XpParticle({ amount, rect, onDone }) {
  const elRef = useRef(null)

  useEffect(() => {
    const el = elRef.current
    if (!el) return

    const startX = rect.left + rect.width  / 2
    const startY = rect.top  + rect.height / 2
    // travel to y=0 (top of viewport)
    const travelY = startY

    let startTs = null
    let rafId

    function tick(ts) {
      if (!startTs) startTs = ts
      const raw      = (ts - startTs) / DURATION
      const progress = Math.min(raw, 1)

      // Y: linear from startY → 0
      const y = startY - travelY * progress

      // X: sinusoidal wave, starts at 0 offset
      const x = startX + Math.sin(progress * Math.PI * WAVE_FREQ) * WAVE_AMP

      // opacity & scale: bell curve peaking at PEAK_AT
      const bellRaw = progress < PEAK_AT
        ? progress / PEAK_AT
        : 1 - (progress - PEAK_AT) / (1 - PEAK_AT)
      const bell    = easeInOut(Math.max(0, Math.min(1, bellRaw)))
      const opacity = bell
      const scale   = 0.4 + bell * 0.6

      el.style.transform  = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale})`
      el.style.opacity    = opacity

      if (progress < 1) {
        rafId = requestAnimationFrame(tick)
      } else {
        onDone?.()
      }
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, []) // eslint-disable-line

  return (
    <div
      ref={elRef}
      className="xpFloat"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        transform: `translate(${rect.left + rect.width / 2}px, ${rect.top + rect.height / 2}px) translate(-50%, -50%) scale(0)`,
        opacity: 0,
        pointerEvents: 'none',
        zIndex: 9998,
        userSelect: 'none',
        willChange: 'transform, opacity',
      }}
    >
      +{amount} XP
    </div>
  )
}

// Renders all active XP float events
export default function XpFloat({ events, onDismiss }) {
  return (
    <>
      {events.map(ev => (
        <XpParticle
          key={ev.id}
          amount={ev.amount}
          rect={ev.rect}
          onDone={() => onDismiss(ev.id)}
        />
      ))}
    </>
  )
}
