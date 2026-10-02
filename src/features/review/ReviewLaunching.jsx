import { createPortal } from 'react-dom'
import ReviewLoading from './ReviewLoading.jsx'

// Экран-заглушка на время, пока лениво грузится сам экран повторения (Suspense fallback в
// LearnTab / AdminReviewTab): тап по «Повторить» сразу отвечает тем же «Ищу слова…», а не
// молчит несколько секунд. Вид тот же, что у ожидания внутри ReviewScreen, — при смене
// заглушки на настоящий экран ничего не мигает
export default function ReviewLaunching() {
  return createPortal(
    <div className="reviewScreen" role="dialog" aria-label="Повторение">
      <ReviewLoading text="Ищу слова, которые нужно напомнить…" />
    </div>,
    document.body,
  )
}
