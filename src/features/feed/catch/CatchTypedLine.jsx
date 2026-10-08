import { Fragment, useMemo } from 'react'
import { phraseUnits } from './catchPhraseUnits.js'
import { fontPx, FIT_NONE } from './catchFit.js'

// Строка набранного под фразой в полоске «Ловли слов» (feed-catch-strip.css: .catchTypedLine) — выровнена по облачкам.
// Рендерит те же слова фразы (phraseUnits: слово со своими знаками) тем же шрифтом, тем же масштабом (fit — как у фразы:
// font-size и word-spacing) и по центру: пробелы — разделителями (обычным текстом, с тем же word-spacing), каждое
// слово — слотом .catchTypedWord с min-width = ширина этого слова в оригинале (widths — measureWords: { [index]: px })
// и текстом по левому краю. Набранное встаёт колонками под своими словами; пустой слот — пустое место той же ширины
// (ZWSP держит базовую линию; курсор .catchCaret вообще вне потока — absolute, раскладку не меняет). Набранное — лаймом
// на всём протяжении набора (не белеет при переходе к следующему слову), активное слово отличается курсором и слотом.
// Финал (result): та же строка и те же слоты — набранное перекрашивается: верные зелёным, неверные красным,
// пропущенные «—»; цвет проявляется с задержкой --catch-cmp-delay (после раскрытия всех облачков). Позже строка вместе
// с фразой сжимается к центру (word-spacing, --catch-compress-delay): слоты и ширины те же, колонки под словами сохраняются.
// Курсор мигает только после паузы: key={typed.length} перемонтирует его на каждый ввод/стирание, анимация начинается
// заново с сплошной фазы (opacity 1, 0–55% цикла = 0.6с), поэтому при быстром наборе он всегда виден на новом месте.
// title — фраза; typedBy — Map index → строка; cur — активное слово; results — [{ index, ok, typed }] на финале
export default function CatchTypedLine({
  title, widths = null, fit = FIT_NONE, typedBy, cur = null, result = false, results = null,
}) {
  const resultOf = index => results?.find(r => r.index === index) ?? null
  // Разбор фразы на слова — только при смене фразы, не на каждую набранную букву
  const units = useMemo(() => phraseUnits(title), [title])
  return (
    <div
      className={`catchTypedLine${result ? ' catchTypedLineResult' : ''}${fit.wrap ? ' catchTypedLineWrap' : ''}`}
      style={{ fontSize: fontPx(fit.scale) }}
      aria-live="polite"
      aria-label={result ? 'Набранное' : undefined}
    >
      {units.map(u => {
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
          // Текст — во внутреннем .catchTypedText (position: relative): курсор лежит в нём absolute (left: 100% — сразу
          // после последней буквы) и в потоке места не занимает, так что слот и строка не меняют ширину при его
          // появлении/исчезновении/мигании. Пустой слот: курсор в начале слота (.catchTypedTextEmpty)
          word = (
            <span className="catchTypedWord" style={style}>
              <span className={typed ? 'catchTypedText' : 'catchTypedText catchTypedTextEmpty'}>
                {typed || '​'}
                {on && <i key={typed.length} className="catchCaret" aria-hidden="true" />}
              </span>
            </span>
          )
        }
        return <Fragment key={u.index}>{word}{u.gap}</Fragment>
      })}
    </div>
  )
}
