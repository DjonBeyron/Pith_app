import { buildSpans, hexToRgba, sameStyle, bridgeSpans, splitLines, decorStyle } from '../lib/textHighlight.js'

// «Булавка» — точечная плашка на одной-двух буквах внутри слова (try → tries,
// stop → stopped). У одиночной буквы поле в шрифте слева и справа несимметрично
// (слева уже) — симметричный inset сажал плашку с явным сдвигом от чернил
// буквы, а margin: 0 (декоративный слой поверх текста) не раздвигал соседей
// вообще. Обе формулы подобраны вручную на контроллере (слайдеры вживую,
// сверено на «try», «stopped», «again») — не расчётом с одной попытки.
// bottom одинаково глубокий у обеих: буквы с хвостиком (y, g, p, q) должны
// помещаться, даже если сам пример их не содержит — резать хвостик хуже, чем
// оставить чуть лишнего места у буквы без хвостика.
const PIN_SOLO = { left: -0.7, right: -0.4, top: 2, bottom: -1.6, radius: 1.5, margin: 1.8 }
const PIN_PAIR = { left: -0.9, right: -0.8, top: 2.5, bottom: -1.6, radius: 1.5, margin: 1.8 }

function BgSpan({ color, opacity, radius, extLeft, extRight, textColor, outline, pin, pinLen, decor, children }) {
  const c = hexToRgba(color, opacity ?? 1)
  const p = pin ? (pinLen <= 1 ? PIN_SOLO : PIN_PAIR) : null
  return (
    <span style={{ position: 'relative', ...(p ? { margin: `0 ${p.margin}px` } : {}) }}>
      <span
        aria-hidden="true"
        data-hl-bg="true"
        style={{
          position: 'absolute',
          ...(p
            ? { left: `${p.left}px`, right: `${p.right}px`, top: `${p.top}px`, bottom: `${p.bottom}px` }
            : {
                left:  extLeft  ? '-1.5px' : 0,
                right: extRight ? '-1.5px' : 0,
                // top/bottom с запасом вниз: буква с хвостиком (y, p, у, д) внутри
                // рамки — обычное дело (буквы внутри слов, а не только целые слова),
                // и старый bottom: 1px обрезал хвостик. -2px вместо него хватает и
                // одиночной букве, и целому слову, не делая рамку заметно крупнее
                top: '2px', bottom: '-2px',
              }),
          // Плашка-обводка: только рамка, без заливки
          ...(outline ? { border: `1.5px solid ${c}` } : { background: c }),
          borderRadius: p ? `${p.radius}px` : radius,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <span style={{
        position: 'relative', zIndex: 1,
        ...(textColor ? { color: textColor } : {}),
        ...decor,
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

      // Жирность, подчёркивание, зачёркивание — общий стиль (textHighlight.js)
      const decor = decorStyle(s)

      if (!s.h) {
        out.push(<span key={key} style={decor}>{line}</span>)
      } else if (s.h.mode === 'text') {
        out.push(
          <span key={key} style={{ color: hexToRgba(s.h.color, s.h.opacity ?? 1), ...decor }}>{line}</span>
        )
      } else {
        const radius = openLeft && openRight ? 0
          : openLeft  ? '0 3px 3px 0'
          : openRight ? '3px 0 0 3px'
          : 3
        out.push(
          <BgSpan key={key} color={s.h.color} opacity={s.h.opacity} radius={radius}
            extLeft={!openLeft} extRight={!openRight} textColor={textColor}
            outline={s.h.outline} pin={s.h.pin} pinLen={line.length} decor={decor}>
            {line}
          </BgSpan>
        )
      }
      return out
    })
  })
}
