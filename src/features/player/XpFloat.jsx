import { useEffect, useRef } from 'react'

const DURATION   = 1600   // ms total flight time
const WAVE_AMP   = 36     // px horizontal swing amplitude
const WAVE_FREQ  = 2.5    // sine cycles during flight
// opacity/scale: rises 0→1 in first PEAK_AT, falls 1→0 in the rest
const PEAK_AT    = 0.42
const KEYFRAMES  = 48     // ключевых кадров на полёт (волна по X гладкая и при 48)

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

    // Траектория считается один раз в ключевые кадры, а летит частица на
    // компоузере (Web Animations). Раньше каждый кадр писал transform/opacity
    // из rAF главного потока — и когда в тот же момент приходило сообщение
    // (рендер React, раскладка, въезд строки), кадры rAF опаздывали, и
    // частица дёргалась. Анимация transform/opacity на компоузере от
    // загрузки главного потока не зависит
    const frames = []
    for (let i = 0; i <= KEYFRAMES; i++) {
      const progress = i / KEYFRAMES
      const y = startY - travelY * progress                               // linear from startY → 0
      const x = startX + Math.sin(progress * Math.PI * WAVE_FREQ) * WAVE_AMP // sinusoidal wave
      const bellRaw = progress < PEAK_AT                                   // bell curve peaking at PEAK_AT
        ? progress / PEAK_AT
        : 1 - (progress - PEAK_AT) / (1 - PEAK_AT)
      const bell  = easeInOut(Math.max(0, Math.min(1, bellRaw)))
      const scale = 0.4 + bell * 0.6
      frames.push({ transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale})`, opacity: bell })
    }
    const anim = el.animate(frames, { duration: DURATION, easing: 'linear', fill: 'forwards' })
    anim.onfinish = () => onDone?.()
    return () => anim.cancel()
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
