import { plural } from '../../../shared/lib/plural.js'

// Строка факта финала «Ловли слов» — «Тебе удалось расслышать N из M слов» по центру слота под строкой набранного
// (CatchStrip; стили — feed-catch-fact.css: .catchFactSlot / .catchFact). Монтируется только на финале. Проявляется БЛЕСКОМ:
// · .catchFactBase — тусклая строка («призрак», в потоке — задаёт размер, высота не меняется);
// · .catchFactReveal (поверх, overflow hidden по границам строки) → .catchFactCurtain (шторка, едет translateX слева направо) →
//   .catchFactClip (окно, overflow hidden — режет яркую копию по фронту шторки) → .catchFactLit (тот же текст яркий, едет
//   навстречу шторке — текст стоит на месте, окно открывается) + .catchFactSweep (светлая полоса на фронте шторки, вне окна).
// Анимируется только transform/opacity, один проход (CATCH_FACT_REVEAL_MS, задержка --catch-glint-delay из CatchStrip).
// Яркая копия скрыта от скринридера — читается один текст.
export default function CatchFact({ ok, total }) {
  const text = `Тебе удалось расслышать ${ok} из ${total} ${plural(total, 'слова', 'слов', 'слов')}`
  return (
    <div className="catchFact" role="status">
      <span className="catchFactText">
        <span className="catchFactBase">{text}</span>
        <span className="catchFactReveal" aria-hidden="true">
          <span className="catchFactCurtain">
            <span className="catchFactClip">
              <span className="catchFactLit">{text}</span>
            </span>
            <span className="catchFactSweep" />
          </span>
        </span>
      </span>
    </div>
  )
}
