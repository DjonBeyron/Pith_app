import { useState, useEffect, useRef, useMemo } from 'react'
import { buildSpans, bridgeSpans, sameStyle, hexToRgba } from '../../shared/lib/textHighlight.js'

// Посимвольная анимация с поддержкой выделений (та же система что TextModule).
// revealedCharIdx — управляемый режим (синхронизация с аудио через Groq).
// Без revealedCharIdx — автономный режим с внутренним таймером.
export default function PlayerTypingText({ text, speed = 45, onTypingChange, highlights = [], revealedCharIdx }) {
  const isControlled = revealedCharIdx !== undefined
  const [count, setCount] = useState(0)
  const timerRef  = useRef(null)
  const changeRef = useRef(onTypingChange)
  useEffect(() => { changeRef.current = onTypingChange }, [onTypingChange])

  const spans = useMemo(() => bridgeSpans(buildSpans(text, highlights ?? [])), [text, highlights])

  // Auto-timer mode
  useEffect(() => {
    if (isControlled) return
    setCount(0) // eslint-disable-line
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

  useEffect(() => {
    if (!isControlled) return
    changeRef.current?.(revealedCharIdx >= 0)
  }, [revealedCharIdx, isControlled])

  const displayCount = isControlled ? Math.max(0, revealedCharIdx + 1) : count
  const showCursor   = displayCount < text.length

  let charsLeft = displayCount
  const rendered = []

  for (let si = 0; si < spans.length; si++) {
    if (charsLeft <= 0) break
    const s = spans[si]
    const visible   = s.text.slice(0, charsLeft)
    const isPartial = visible.length < s.text.length
    charsLeft -= visible.length
    const cursorHere = showCursor && charsLeft === 0

    if (!s.h) {
      rendered.push(
        <span key={si}>{visible}{cursorHere && <span className="playerCursor" />}</span>
      )
      continue
    }

    if (s.h.mode === 'text') {
      const c = hexToRgba(s.h.color, s.h.opacity ?? 1)
      rendered.push(
        <span key={si} style={{ color: c }}>{visible}{cursorHere && <span className="playerCursor" />}</span>
      )
      continue
    }

    // bg mode — плашка на самом span (без absolute) для синхронного рендера на iOS
    const prevSame  = sameStyle(spans[si - 1]?.h, s.h)
    const nextSame  = !isPartial && sameStyle(spans[si + 1]?.h, s.h)
    const radius    = prevSame && nextSame ? '0'
      : prevSame  ? '0 3px 3px 0'
      : nextSame  ? '3px 0 0 3px'
      : '3px'
    const textColor = s.textUnder ? hexToRgba(s.textUnder.color, s.textUnder.opacity ?? 1) : null
    const bgColor   = hexToRgba(s.h.color, s.h.opacity ?? 1)
    // box-shadow расширяет фон влево/вправо без влияния на layout
    const shadowL   = !prevSame               ? `-1.5px 0 0 0 ${bgColor}` : null
    const shadowR   = (!isPartial && !nextSame) ? `1.5px 0 0 0 ${bgColor}`  : null
    const boxShadow = [shadowL, shadowR].filter(Boolean).join(', ') || undefined

    rendered.push(
      <span key={si} style={{
        background: bgColor,
        borderRadius: radius,
        boxShadow,
        paddingTop: '2px',
        paddingBottom: '1px',
        ...(textColor ? { color: textColor } : {}),
      }}>
        {visible}{cursorHere && <span className="playerCursor" />}
      </span>
    )
  }

  return <span className="playerTypingText">{rendered}</span>
}
