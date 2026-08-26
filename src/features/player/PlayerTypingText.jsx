import { useState, useEffect, useRef, useMemo } from 'react'
import { buildSpans, bridgeSpans, sameStyle, hexToRgba, decorStyle } from '../../shared/lib/textHighlight.js'
import { usePlayerFrozen } from './playerFrozen.js'

// Посимвольная анимация с поддержкой выделений (та же система что TextModule).
// revealedCharIdx — управляемый режим (синхронизация с аудио через Groq).
// Без revealedCharIdx — автономный режим с внутренним таймером.
export default function PlayerTypingText({ text, speed = 45, onTypingChange, highlights = [], revealedCharIdx }) {
  const isControlled = revealedCharIdx !== undefined
  // Шаговый режим админа: на заморозке печать замирает на месте и продолжается
  // с той же буквы. Управляемый режим (синхронизация с аудио) замирает сам —
  // вместе с остановленным звуком
  const frozen = usePlayerFrozen()
  const [count, setCount] = useState(0)
  const charRef   = useRef(0)
  const timerRef  = useRef(null)
  const changeRef = useRef(onTypingChange)
  useEffect(() => { changeRef.current = onTypingChange }, [onTypingChange])

  const spans = useMemo(() => bridgeSpans(buildSpans(text, highlights ?? [])), [text, highlights])

  // Новый текст — печатаем с начала
  useEffect(() => {
    if (isControlled) return
    charRef.current = 0
    setCount(0) // eslint-disable-line
  }, [text, speed, isControlled])

  // Auto-timer mode
  useEffect(() => {
    if (isControlled || frozen) return
    changeRef.current?.(true)
    timerRef.current = setInterval(() => {
      charRef.current += 1
      setCount(charRef.current)
      if (charRef.current >= text.length) {
        clearInterval(timerRef.current)
        changeRef.current?.(false)
      }
    }, speed)
    return () => { clearInterval(timerRef.current); changeRef.current?.(false) }
  }, [text, speed, isControlled, frozen])

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

    // Печатаемый кусок может содержать переносы: строки рисуются по
    // отдельности, между ними <br>. Курсор всегда на последней строке —
    // анимация печати идёт как обычно, просто перескакивает на новую строку.
    const lines = visible.split('\n')
    const lastLine = lines.length - 1

    // Жирность, подчёркивание, зачёркивание — общий стиль (textHighlight.js)
    const decor = decorStyle(s)

    if (!s.h) {
      lines.forEach((line, k) => {
        if (k > 0) rendered.push(<br key={`${si}-br-${k}`} />)
        if (!line && k !== lastLine) return
        rendered.push(
          <span key={`${si}-${k}`} style={decor}>{line}{cursorHere && k === lastLine && <span className="playerCursor" />}</span>
        )
      })
      continue
    }

    if (s.h.mode === 'text') {
      const c = hexToRgba(s.h.color, s.h.opacity ?? 1)
      lines.forEach((line, k) => {
        if (k > 0) rendered.push(<br key={`${si}-br-${k}`} />)
        if (!line && k !== lastLine) return
        rendered.push(
          <span key={`${si}-${k}`} style={{ color: c, ...decor }}>{line}{cursorHere && k === lastLine && <span className="playerCursor" />}</span>
        )
      })
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
    // Плашка-обводка: рамка внутренней тенью — border сдвинул бы буквы
    const outlineShadow = s.h.outline ? `inset 0 0 0 1.5px ${bgColor}` : null
    // box-shadow расширяет фон влево/вправо без влияния на layout
    const shadowL   = !prevSame               ? `-1.5px 0 0 0 ${bgColor}` : null
    const shadowR   = (!isPartial && !nextSame) ? `1.5px 0 0 0 ${bgColor}`  : null
    const boxShadow = [shadowL, shadowR].filter(Boolean).join(', ') || undefined

    lines.forEach((line, k) => {
      if (k > 0) rendered.push(<br key={`${si}-br-${k}`} />)
      if (!line && k !== lastLine) return
      rendered.push(
        <span key={`${si}-${k}`} style={{
          ...(s.h.outline ? {} : { background: bgColor }),
          borderRadius: radius,
          // «Вылет» плашки — только на настоящих краях выделения, а не на
          // месте переноса: иначе на каждой строке торчал бы лишний хвост
          boxShadow: s.h.outline ? outlineShadow
            : k === 0 && k === lastLine ? boxShadow
            : k === 0 ? shadowL ?? undefined
            : k === lastLine ? shadowR ?? undefined
            : undefined,
          paddingTop: '2px',
          paddingBottom: '1px',
          ...(textColor ? { color: textColor } : {}),
          ...decor,
        }}>
          {line}{cursorHere && k === lastLine && <span className="playerCursor" />}
        </span>
      )
    })
  }

  return <span className="playerTypingText">{rendered}</span>
}
