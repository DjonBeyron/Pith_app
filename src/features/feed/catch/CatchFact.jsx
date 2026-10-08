import { plural } from '../../../shared/lib/plural.js'

// Строка факта финала «Ловли слов» — «Расслышал N из M слов» по центру слота под строкой набранного (CatchStrip,
// feed-catch-strip.css: .catchFactSlot / .catchFact). Монтируется только на финале и плавно проявляется через opacity
// (220мс, без посимвольной печати); задержку (--catch-fact-delay) задаёт CatchStrip — после линии и взрыва последнего облачка.
export default function CatchFact({ ok, total }) {
  const text = `Расслышал ${ok} из ${total} ${plural(total, 'слова', 'слов', 'слов')}`
  return <div className="catchFact" role="status">{text}</div>
}
