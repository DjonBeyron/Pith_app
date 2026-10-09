import { plural } from '../../../shared/lib/plural.js'

// Строка факта финала «Ловли слов» — «Тебе удалось расслышать N из M слов» по центру слота под строкой набранного
// (CatchStrip; стили — feed-catch-fact.css: .catchFactSlot / .catchFact). Монтируется только на финале. Блестит САМ ТЕКСТ:
// один элемент .catchFactText, буквы закрашены градиентом (background-clip: text), по которому один раз проходит «фронт» —
// буквы вспыхивают белым и за фронтом плавно тухнут обратно в тот же серый (rgba 0.38), каким строка была до блеска; вне букв
// ничего не рисуется (ни полосы, ни свечения). До блеска и после — один и тот же серый. Анимируется только положение градиента, один проход.
export default function CatchFact({ ok, total }) {
  const text = `Тебе удалось расслышать ${ok} из ${total} ${plural(total, 'слова', 'слов', 'слов')}`
  return (
    <div className="catchFact" role="status">
      <span className="catchFactText">{text}</span>
    </div>
  )
}
