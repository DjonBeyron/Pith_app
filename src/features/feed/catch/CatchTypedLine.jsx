import { Fragment } from 'react'
import { phraseUnits } from './catchPhraseUnits.js'
import { fontPx, FIT_NONE } from './catchFit.js'

// Строка набранного под фразой в полоске «Ловли слов» (feed-catch-strip.css: .catchTypedLine) — выровнена по облачкам.
// Рендерит те же слова фразы (phraseUnits: слово со своими знаками) тем же шрифтом, тем же масштабом (fit — как у фразы:
// font-size и word-spacing) и по центру: пробелы — разделителями (обычным текстом, с тем же word-spacing), каждое
// слово — слотом .catchTypedWord с min-width = ширина этого слова в оригинале (widths — measureWords: { [index]: px })
// и текстом по левому краю. Набранное встаёт колонками под своими словами; пустой слот — пустое место той же ширины
// (ZWSP держит базовую линию; курсор .catchCaret высоты в потоке не имеет — базовая линия у всех слотов общая). Набранное — лаймом на всём протяжении набора (не белеет при переходе к следующему слову),
// активное слово отличается курсором и слотом.
// Финал (result): та же строка и те же слоты — набранное перекрашивается: верные зелёным, неверные красным,
// пропущенные «—»; цвет проявляется с задержкой --catch-cmp-delay (после раскрытия всех облачков).
// title — фраза; typedBy — Map index → строка; cur — активное слово; results — [{ index, ok, typed }] на финале
export default function CatchTypedLine({
  title, widths = null, fit = FIT_NONE, typedBy, cur = null, result = false, results = null,
}) {
  const resultOf = index => results?.find(r => r.index === index) ?? null
  return (
    <div
      className={`catchTypedLine${result ? ' catchTypedLineResult' : ''}${fit.wrap ? ' catchTypedLineWrap' : ''}`}
      style={{ fontSize: fontPx(fit.scale) }}
      aria-live="polite"
      aria-label={result ? 'Набранное' : undefined}
    >
      {phraseUnits(title).map(u => {
        const style = { minWidth: widths?.[u.index] }
        let word
        if (result) {
          const typed = resultOf(u.index)?.typed ?? typedBy?.get(u.index) ?? ''
          const ok = resultOf(u.index)?.ok
          const cls = !typed ? 'catchCmpMiss' : ok ? 'catchCmpOk' : 'catchCmpBad'
          word = <span className={`catchTypedWord ${cls}`} style={style}>{typed || '—'}</span>
        } else {
          const typed = typedBy?.get(u.index) ?? ''
          const on = u.index === cur
          word = (
            <span className="catchTypedWord" style={style}>
              {typed || '​'}
              {on && <i className="catchCaret" aria-hidden="true" />}
            </span>
          )
        }
        return <Fragment key={u.index}>{word}{u.gap}</Fragment>
      })}
    </div>
  )
}
