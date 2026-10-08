import { useState } from 'react'

// Заглушка спойлера для слабых устройств (см. deviceTier.js) и системного
// prefers-reduced-motion: визуально тот же узор мелких шариков, что и у
// PhraseBubbleAnimated, но целиком через CSS — тайловый SVG-паттерн
// (background-image — общий класс .bubblePattern, см. feed-bubble-spoiler.css), без единого кадра JS,
// без измерения/пересборки сетки под конкретный текст. Тап — узор гаснет
// CSS-переходом opacity, текст открывается сразу (как и у canvas-версии).
// Режим «Ловли слов» (catch/CatchStripPhrase): onTap(e) — задан → тап не открывает, а отдаётся родителю;
// explode — стал true → узор гаснет, как по тапу
export default function PhraseBubbleStatic({ onUnlock, onTap, explode = false, children }) {
  const [unlocked, setUnlocked] = useState(false)
  const [removed, setRemoved] = useState(false)

  // Внешняя команда «гасни» (проп explode): переход ловим при рендере (не в эффекте — правило react-hooks)
  const [prevExplode, setPrevExplode] = useState(explode)
  if (explode !== prevExplode) {
    setPrevExplode(explode)
    if (explode && !unlocked) setUnlocked(true)
  }

  function tap(e) {
    if (onTap) { onTap(e); return }
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
          className={unlocked ? 'phraseBubbleStatic bubblePattern phraseBubbleStaticFading' : 'phraseBubbleStatic bubblePattern'}
          aria-hidden="true"
          onTransitionEnd={() => unlocked && setRemoved(true)}
        />
      )}
    </div>
  )
}
