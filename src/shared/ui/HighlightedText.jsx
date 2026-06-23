import { buildSpans, hexToRgba } from '../lib/textHighlight.js'

function sameStyle(a, b) {
  return a && b && a.color === b.color && a.mode === b.mode && a.opacity === b.opacity
}

function bridgeSpans(spans) {
  return spans.map((s, i) => {
    if (!s.h && /^\s+$/.test(s.text) && sameStyle(spans[i - 1]?.h, spans[i + 1]?.h))
      return { ...s, h: spans[i - 1].h }
    return s
  })
}

function BgSpan({ color, opacity, radius, extLeft, extRight, textColor, children }) {
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
      <span style={{ position: 'relative', zIndex: 1, ...(textColor ? { color: textColor } : {}) }}>
        {children}
      </span>
    </span>
  )
}

export default function HighlightedText({ text, highlights }) {
  const spans = bridgeSpans(buildSpans(text, highlights ?? []))
  return spans.map((s, i) => {
    if (!s.h) return <span key={i}>{s.text}</span>
    const c = hexToRgba(s.h.color, s.h.opacity ?? 1)
    if (s.h.mode === 'text') return <span key={i} style={{ color: c }}>{s.text}</span>
    const prevSame = sameStyle(spans[i - 1]?.h, s.h)
    const nextSame = sameStyle(spans[i + 1]?.h, s.h)
    const radius = prevSame && nextSame ? 0
      : prevSame  ? '0 3px 3px 0'
      : nextSame  ? '3px 0 0 3px'
      : 3
    const textColor = s.textUnder
      ? hexToRgba(s.textUnder.color, s.textUnder.opacity ?? 1)
      : null
    return (
      <BgSpan key={i} color={s.h.color} opacity={s.h.opacity} radius={radius}
        extLeft={!prevSame} extRight={!nextSame} textColor={textColor}>
        {s.text}
      </BgSpan>
    )
  })
}
