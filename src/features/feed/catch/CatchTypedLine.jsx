import { splitTitleTokens } from '../../../shared/lib/titleWords.js'

// Строка набранного под фразой в полоске «Ловли слов» (feed-catch-strip.css: .catchTypedLine) — выровнена по облачкам.
// Рендерит те же токены фразы тем же шрифтом: знаки и пробелы — разделителями (обычным текстом), каждое слово —
// слотом .catchTypedWord с min-width = ширина этого слова в оригинале (widths — measureWords: { [index]: px }) и
// текстом по левому краю. Набранное встаёт колонками под своими словами; пустой слот — пустое место той же ширины
// (ZWSP держит базовую линию). Текущее слово — лаймом с курсором.
// Финал (result): та же строка и те же слоты — набранное перекрашивается: верные зелёным, неверные красным,
// пропущенные «—»; цвет проявляется с задержкой --catch-cmp-delay (после раскрытия всех облачков).
// title — фраза; typedBy — Map index → строка; cur — активное слово; results — [{ index, ok, typed }] на финале
export default function CatchTypedLine({ title, widths = null, typedBy, cur = null, result = false, results = null }) {
  const resultOf = index => results?.find(r => r.index === index) ?? null
  return (
    <div
      className={result ? 'catchTypedLine catchTypedLineResult' : 'catchTypedLine'}
      aria-live="polite"
      aria-label={result ? 'Набранное' : undefined}
    >
      {splitTitleTokens(title).map((t, i) => {
        if (!t.word) return <span key={i}>{t.text}</span>
        const style = { minWidth: widths?.[t.index] }
        if (result) {
          const typed = resultOf(t.index)?.typed ?? typedBy?.get(t.index) ?? ''
          const ok = resultOf(t.index)?.ok
          const cls = !typed ? 'catchCmpMiss' : ok ? 'catchCmpOk' : 'catchCmpBad'
          return <span key={i} className={`catchTypedWord ${cls}`} style={style}>{typed || '—'}</span>
        }
        const typed = typedBy?.get(t.index) ?? ''
        const on = t.index === cur
        return (
          <span key={i} className={on ? 'catchTypedWord catchTypedWordCur' : 'catchTypedWord'} style={style}>
            {typed || '​'}
            {on && <i className="twCaret catchCaret" aria-hidden="true" />}
          </span>
        )
      })}
    </div>
  )
}
