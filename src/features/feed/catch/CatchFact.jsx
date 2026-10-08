import { plural } from '../../../shared/lib/plural.js'

// Строка факта финала «Ловли слов» — «Тебе удалось расслышать N из M слов» по центру слота под строкой набранного
// (CatchStrip, feed-catch-strip.css: .catchFactSlot / .catchFact). Монтируется только на финале. Два слоя одного текста:
// тусклый (.catchFactBase: opacity 0→1 за 220мс, остаётся rgba(255,255,255,0.38)) и белый (.catchFactGlint: поверх, один
// проход ~820мс — вспыхивает и гаснет, см. CATCH_FACT_GLINT_MS в catchTiming.js). Анимируется только opacity. Задержку
// (--catch-fact-delay) задаёт CatchStrip — после линии и взрыва последнего облачка. Белый слой скрыт от скринридера.
export default function CatchFact({ ok, total }) {
  const text = `Тебе удалось расслышать ${ok} из ${total} ${plural(total, 'слова', 'слов', 'слов')}`
  return (
    <div className="catchFact" role="status">
      <span className="catchFactBase">{text}</span>
      <span className="catchFactGlint" aria-hidden="true">{text}</span>
    </div>
  )
}
