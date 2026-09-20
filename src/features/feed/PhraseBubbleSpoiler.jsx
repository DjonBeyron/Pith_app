import { useState } from 'react'
import { isWeakDevice } from '../../shared/lib/deviceTier.js'
import { perfFlags } from '../../shared/lib/perfFlags.js'
import PhraseBubbleAnimated from './PhraseBubbleAnimated.jsx'
import PhraseBubbleStatic from './PhraseBubbleStatic.jsx'

// Переключатель: на способных устройствах — живая canvas-анимация шариков
// (PhraseBubbleAnimated), на слабых (см. deviceTier.js) и при системном
// prefers-reduced-motion — лёгкая CSS/SVG-заглушка без JS-анимации
// (PhraseBubbleStatic). Решение снимается один раз при монтировании
// (useState с ленивым инициализатором) — устройство не «слабеет» посреди
// сессии, а лишний рендер-чек на каждый рендер не нужен
export default function PhraseBubbleSpoiler({ active, tabVisible = true, onUnlock, children }) {
  // perfFlags.noBubbles — бисекция лага сворачивания (shared/lib/perfFlags.js)
  const [useStatic] = useState(() =>
    perfFlags.noBubbles || isWeakDevice() || window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  if (useStatic) return <PhraseBubbleStatic onUnlock={onUnlock}>{children}</PhraseBubbleStatic>
  return <PhraseBubbleAnimated active={active} tabVisible={tabVisible} onUnlock={onUnlock}>{children}</PhraseBubbleAnimated>
}
