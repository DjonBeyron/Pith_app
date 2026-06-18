import { useState, useEffect, useRef, useMemo } from 'react'
import { buildCharStyles, hexToRgba } from '../../shared/lib/textHighlight.js'

// Посимвольная анимация с поддержкой выделений.
// revealedCharIdx — управляемый режим (синхронизация с аудио через Groq).
// Без revealedCharIdx — автономный режим с внутренним таймером.
export default function PlayerTypingText({ text, speed = 45, onTypingChange, highlights = [], revealedCharIdx }) {
  const isControlled = revealedCharIdx !== undefined
  const [count, setCount] = useState(0)
  const timerRef  = useRef(null)
  const changeRef = useRef(onTypingChange)
  useEffect(() => { changeRef.current = onTypingChange }, [onTypingChange])

  const charStyles = useMemo(() => buildCharStyles(text, highlights), [text, highlights])

  // Auto-timer mode: runs only when not controlled externally
  useEffect(() => {
    if (isControlled) return
    setCount(0)
    changeRef.current?.(true)
    let i = 0
    timerRef.current = setInterval(() => {
      i++
      setCount(i)
      if (i >= text.length) {
        clearInterval(timerRef.current)
        changeRef.current?.(false)
      }
    }, speed)
    return () => { clearInterval(timerRef.current); changeRef.current?.(false) }
  }, [text, speed, isControlled])

  // In controlled mode notify parent when at least one char is revealed
  useEffect(() => {
    if (!isControlled) return
    changeRef.current?.(revealedCharIdx >= 0)
  }, [revealedCharIdx, isControlled])

  const displayCount = isControlled ? Math.max(0, revealedCharIdx + 1) : count

  return (
    <span className="playerTypingText">
      {text.slice(0, displayCount).split('').map((ch, i) => {
        const h = charStyles?.[i]
        const style = h ? {
          color:        h.color   || undefined,
          fontWeight:   h.bold    ? 700 : undefined,
          background:   h.bgColor ? hexToRgba(h.bgColor, h.bgOpacity ?? 0.3) : undefined,
          borderRadius: h.bgColor ? '3px' : undefined,
          padding:      h.bgColor ? '0 2px' : undefined,
        } : undefined
        return <span key={i} className="playerTypingChar" style={style}>{ch}</span>
      })}
      {displayCount < text.length && <span className="playerCursor" />}
      {displayCount < text.length && (
        <span className="playerUnrevealed">{text.slice(displayCount)}</span>
      )}
    </span>
  )
}
