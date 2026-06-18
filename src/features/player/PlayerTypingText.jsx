import { useState, useEffect, useRef, useMemo } from 'react'
import { buildCharStyles, hexToRgba } from '../../shared/lib/textHighlight.js'

// Посимвольная анимация с поддержкой выделений (цвет, жирный, подложка).
export default function PlayerTypingText({ text, speed = 45, onTypingChange, highlights = [] }) {
  const [count,   setCount]   = useState(0)
  const timerRef  = useRef(null)
  const changeRef = useRef(onTypingChange)
  useEffect(() => { changeRef.current = onTypingChange }, [onTypingChange])

  const charStyles = useMemo(() => buildCharStyles(text, highlights), [text, highlights])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
  }, [text, speed])

  const revealed = text.slice(0, count).split('')

  return (
    <span className="playerTypingText">
      {revealed.map((ch, i) => {
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
      {count < text.length && <span className="playerCursor" />}
      {count < text.length && (
        <span className="playerUnrevealed">{text.slice(count)}</span>
      )}
    </span>
  )
}
