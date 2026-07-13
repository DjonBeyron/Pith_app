import { useState } from 'react'
import { isWeakDevice } from '../../shared/lib/deviceTier.js'
import PhraseBubbleAnimated from './PhraseBubbleAnimated.jsx'
import PhraseBubbleStatic from './PhraseBubbleStatic.jsx'

// Переключатель: на способных устройствах — живая canvas-анимация шариков
// (PhraseBubbleAnimated), на слабых (см. deviceTier.js) и при системном
// prefers-reduced-motion — лёгкая CSS/SVG-заглушка без JS-анимации
// (PhraseBubbleStatic). Решение снимается один раз при монтировании
// (useState с ленивым инициализатором) — устройство не «слабеет» посреди
// сессии, а лишний рендер-чек на каждый рендер не нужен
export default function PhraseBubbleSpoiler({ active, near, onUnlock, children }) {
  const [useStatic] = useState(() =>
    isWeakDevice() || window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  if (useStatic) return <PhraseBubbleStatic onUnlock={onUnlock}>{children}</PhraseBubbleStatic>
  return <PhraseBubbleAnimated active={active} near={near} onUnlock={onUnlock}>{children}</PhraseBubbleAnimated>
}
