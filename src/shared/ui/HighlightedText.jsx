import { buildSpans, hexToRgba, sameStyle, bridgeSpans, splitLines } from '../lib/textHighlight.js'

function BgSpan({ color, opacity, radius, extLeft, extRight, textColor, bold, children }) {
  const c = hexToRgba(color, opacity ?? 1)
  return (
    <span style={{ position: 'relative' }}>
      <span
        aria-hidden="true"
        data-hl-bg="true"
        style={{
          position: 'absolute',
          left:  extLeft  ? '-1.5px' : 0,
          right: extRight ? '-1.5px' : 0,
          top: '4px', bottom: '1px',
          background: c,
          borderRadius: radius,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <span style={{
        position: 'relative', zIndex: 1,
        ...(textColor ? { color: textColor } : {}),
        ...(bold ? { fontWeight: 700 } : {}),
      }}>
        {children}
      </span>
    </span>
  )
}

export default function HighlightedText({ text, highlights }) {
  const spans = bridgeSpans(buildSpans(text, highlights ?? []))
  // Каждая строка спана рисуется отдельно, переносы — явными <br>: иначе
  // фон выделения растягивается прямоугольником через весь перенос
  return spans.flatMap((s, i) => {
    const prevSame = sameStyle(spans[i - 1]?.h, s.h)
    const nextSame = sameStyle(spans[i + 1]?.h, s.h)
    const textColor = s.textUnder
      ? hexToRgba(s.textUnder.color, s.textUnder.opacity ?? 1)
      : null

    return splitLines(s.text).flatMap((line, k, arr) => {
      const out = []
      if (k > 0) out.push(<br key={`${i}-br-${k}`} />)
      if (!line) return out
      const key = `${i}-${k}`
      // Скругление и «вылет» фона — только на внешних краях выделения:
      // у строки, продолжающейся ниже, край считается внутренним
      const openLeft = prevSame || k > 0
      const openRight = nextSame || k < arr.length - 1

      const weight = s.bold ? { fontWeight: 700 } : null

      if (!s.h) {
        out.push(<span key={key} style={weight ?? undefined}>{line}</span>)
      } else if (s.h.mode === 'text') {
        out.push(
          <span key={key} style={{ color: hexToRgba(s.h.color, s.h.opacity ?? 1), ...weight }}>{line}</span>
        )
      } else {
        const radius = openLeft && openRight ? 0
          : openLeft  ? '0 3px 3px 0'
          : openRight ? '3px 0 0 3px'
          : 3
        out.push(
          <BgSpan key={key} color={s.h.color} opacity={s.h.opacity} radius={radius}
            extLeft={!openLeft} extRight={!openRight} textColor={textColor} bold={s.bold}>
            {line}
          </BgSpan>
        )
      }
      return out
    })
  })
}
