import { useState } from 'react'
import { explodedRegions, hasExplode, padRegions } from './phraseBubbleRegions.js'

// Заглушка спойлера для слабых устройств (см. deviceTier.js) и системного
// prefers-reduced-motion: визуально тот же узор мелких шариков, что и у
// PhraseBubbleAnimated, но целиком через CSS — тайловый SVG-паттерн
// (background-image — общий класс .bubblePattern, см. feed-bubble-spoiler.css), без единого кадра JS,
// без измерения/пересборки сетки под конкретный текст. Тап — узор гаснет
// CSS-переходом opacity, текст открывается сразу (как и у canvas-версии).
// Режим «Ловли слов» (catch/CatchStripPhrase): onTap(e) — задан → тап не открывает, а отдаётся родителю;
// explode — команда «гасни»: true — весь узор сразу; число n — погасли первые n облачков; массив — индексы погасших.
// regions — прямоугольники слов { x, y, w, h } относительно текстового блока: вместо одной маски на всю фразу —
// по статичной маске на слово (ТОЛЬКО этот fallback слабых устройств; живой canvas рисует облачка одним холстом).
export default function PhraseBubbleStatic({ onUnlock, onTap, explode = false, regions = null, children }) {
  const [unlocked, setUnlocked] = useState(false)
  const [removed, setRemoved] = useState(false)
  const [gone, setGone] = useState(() => new Set()) // облачка, чей переход гашения закончился — убраны из DOM

  // Внешняя команда «гасни» (проп explode): переход ловим при рендере (не в эффекте — правило react-hooks)
  if (hasExplode(explode) && !unlocked) setUnlocked(true)

  function tap(e) {
    if (onTap) { onTap(e); return }
    if (unlocked) return
    setUnlocked(true)
    onUnlock?.()
  }

  const byRegion = Array.isArray(regions)
  const padded = byRegion ? padRegions(regions) : []
  const faded = byRegion ? explodedRegions(explode, regions.length) : null
  return (
    <div className="phraseBubbleWrap" onClick={tap}>
      <div className={unlocked ? 'phraseBubbleText' : 'phraseBubbleText phraseBubbleTextHidden'}>
        {children}
      </div>
      {byRegion ? padded.map((r, i) => !gone.has(i) && (
        <div
          key={i}
          className={faded.has(i) ? 'phraseBubbleStaticWord bubblePattern phraseBubbleStaticFading' : 'phraseBubbleStaticWord bubblePattern'}
          style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
          aria-hidden="true"
          onTransitionEnd={() => faded.has(i) && setGone(g => new Set(g).add(i))}
        />
      )) : !removed && (
        <div
          className={unlocked ? 'phraseBubbleStatic bubblePattern phraseBubbleStaticFading' : 'phraseBubbleStatic bubblePattern'}
          aria-hidden="true"
          onTransitionEnd={() => unlocked && setRemoved(true)}
        />
      )}
    </div>
  )
}
