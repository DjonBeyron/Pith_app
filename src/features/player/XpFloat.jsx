import { useEffect, useRef } from 'react'

const DURATION   = 1600   // ms total flight time
const WAVE_AMP   = 36     // px horizontal swing amplitude
const WAVE_FREQ  = 2.5    // sine cycles during flight
// opacity/scale: rises 0→1 in first PEAK_AT, falls 1→0 in the rest
const PEAK_AT    = 0.42

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}

// Откуда лететь, если кнопка не отдала координаты (панель уже уехала или
// элемент пропал): из центра нижней трети плеера — там же, где панели ответов
function fallbackRect(host) {
  const w = host?.width ?? window.innerWidth
  const h = host?.height ?? window.innerHeight
  const left = (host?.left ?? 0) + w / 2
  const top = (host?.top ?? 0) + h * 0.72
  return { left, top, width: 0, height: 0 }
}

// Single floating XP particle driven by rAF
function XpParticle({ amount, rect, onDone }) {
  const elRef = useRef(null)

  useEffect(() => {
    const el = elRef.current
    if (!el) return

    // Координаты кнопки — от левого верха ЭКРАНА, а частица позиционируется
    // от рамки плеера: на десктопе он живёт в «телефоне» по центру, и без
    // поправки цифра стартовала бы правее и ниже, часто вообще за краем.
    // На мобильном рамка совпадает с экраном — поправка нулевая.
    const host = document.querySelector('.lessonPlayer')?.getBoundingClientRect()
    const ox = host?.left ?? 0
    const oy = host?.top ?? 0

    const from = rect && (rect.width || rect.height || rect.left || rect.top)
      ? rect
      : fallbackRect(host)
    const startX = from.left + from.width  / 2 - ox
    const startY = from.top  + from.height / 2 - oy
    // летим к верхнему краю плеера
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
        transform: 'translate(-100px, -100px) scale(0)',
        /* стартовый кадр невидим (scale 0), дальше позицию считает rAF */
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
