// Сила памяти слова — шаг 1–5 точками (PROJECT.md → «Анализ знаний»: сила
// памяти показывается после прохождения). Общая для итога повторения, карты
// памяти и схемы модуля. Стили — styles/strength-dots.css
export default function StrengthDots({ step, small = false }) {
  if (!step) return null
  return (
    <span className={small ? 'strengthDots strengthDotsSmall' : 'strengthDots'} role="img" aria-label={`Сила памяти ${step} из 5`}>
      {[1, 2, 3, 4, 5].map(i => <span key={i} className={i <= step ? 'strengthDot strengthDotOn' : 'strengthDot'} />)}
    </span>
  )
}
