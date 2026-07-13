import { useState } from 'react'

// Заглушка спойлера для слабых устройств (см. deviceTier.js) и системного
// prefers-reduced-motion: визуально тот же узор мелких шариков, что и у
// PhraseBubbleAnimated, но целиком через CSS — тайловый SVG-паттерн
// (background-image, см. feed-bubble-spoiler.css), без единого кадра JS,
// без измерения/пересборки сетки под конкретный текст. Тап — узор гаснет
// CSS-переходом opacity, текст открывается сразу (как и у canvas-версии)
export default function PhraseBubbleStatic({ onUnlock, children }) {
  const [unlocked, setUnlocked] = useState(false)
  const [removed, setRemoved] = useState(false)

  function tap() {
    if (unlocked) return
    setUnlocked(true)
    onUnlock?.()
  }

  return (
    <div className="phraseBubbleWrap" onClick={tap}>
      <div className={unlocked ? 'phraseBubbleText' : 'phraseBubbleText phraseBubbleTextHidden'}>
        {children}
      </div>
      {!removed && (
        <div
          className={unlocked ? 'phraseBubbleStatic phraseBubbleStaticFading' : 'phraseBubbleStatic'}
          aria-hidden="true"
          onTransitionEnd={() => unlocked && setRemoved(true)}
        />
      )}
    </div>
  )
}
