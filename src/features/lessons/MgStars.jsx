// Ряд из трёх звёзд на карточке пройденного урока в схеме модуля:
// заработанные — золотые, остальные — тусклый контур. Чистая косметика,
// value = 1..3 (лучший результат из lesson_results.stars / локального стора).
export default function MgStars({ value }) {
  return (
    <span className="mgStars" aria-label={`${value} из 3 звёзд`}>
      {[1, 2, 3].map(i => (
        <svg key={i} viewBox="0 0 24 24"
          className={`mgStar${i <= value ? ' mgStarOn' : ''}`}>
          <path d="M12 2.5 14.9 8.6 21.5 9.5 16.7 14.1 17.9 20.7 12 17.5 6.1 20.7 7.3 14.1 2.5 9.5 9.1 8.6Z" />
        </svg>
      ))}
    </span>
  )
}
