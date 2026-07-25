import { Star } from 'lucide-react'

// Ряд из трёх звёзд на карточке пройденного урока в схеме модуля:
// заработанные — золотые, остальные — тусклый контур. Чистая косметика,
// value = 1..3 (лучший результат из lesson_results.stars / локального стора).
export default function MgStars({ value }) {
  return (
    <span className="mgStars" aria-label={`${value} из 3 звёзд`}>
      {[1, 2, 3].map(i => (
        <Star key={i} className={`mgStar${i <= value ? ' mgStarOn' : ''}`} />
      ))}
    </span>
  )
}
