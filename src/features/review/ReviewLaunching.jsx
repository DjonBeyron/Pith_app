import { createPortal } from 'react-dom'
import ReviewLoading from './ReviewLoading.jsx'
import { levelClass } from './reviewLevel.js'

// Экран-заглушка на время, пока лениво грузится сам экран повторения (Suspense fallback в
// LearnTab / AdminReviewTab): тап по «Повторить» сразу отвечает тем же «Ищу слова…», а не
// молчит несколько секунд. Вид тот же, что у ожидания внутри ReviewScreen (в том числе цвет ступени
// первого слова — level), — при смене заглушки на настоящий экран ничего не мигает
export default function ReviewLaunching({ level = null }) {
  return createPortal(
    <div className={`reviewScreen${levelClass(level)}`} role="dialog" aria-label="Повторение">
      <ReviewLoading text="Ищу слова, которые нужно напомнить…" />
    </div>,
    document.body,
  )
}
