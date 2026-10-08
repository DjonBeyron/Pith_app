import { plural } from '../../../shared/lib/plural.js'

// Строка факта финала «Ловли слов» — «Расслышал N из M слов» по центру слота между фразой и строкой набранного
// (CatchStrip, feed-catch-strip.css: .catchFact). Пропечатывается по символам: ghost невидимо держит ширину полного
// текста (центровка не едет), поверх слева печатается тот же текст — span с overflow: hidden и шириной, растущей
// шагами steps(--n); задержку (--catch-fact-delay) задаёт CatchStrip — после линии и взрыва последнего облачка.
export default function CatchFact({ ok, total }) {
  const text = `Расслышал ${ok} из ${total} ${plural(total, 'слова', 'слов', 'слов')}`
  return (
    <div className="catchFact" role="status" aria-label={text} style={{ '--n': text.length }}>
      <span className="catchFactIn">
        <span className="catchFactGhost" aria-hidden="true">{text}</span>
        <span className="catchFactType" aria-hidden="true">{text}</span>
      </span>
    </div>
  )
}
