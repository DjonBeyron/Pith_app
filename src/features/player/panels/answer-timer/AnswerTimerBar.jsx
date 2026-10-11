// Тонкая полоска остатка времени вдоль верхней кромки панели ответа (родитель — fixed-панель). Последняя треть — красная.
export default function AnswerTimerBar({ timer }) {
  if (!timer) return null
  const low = timer.fraction <= 1 / 3
  return (
    <div className="answerTimer" role="timer" aria-label="Время на ответ">
      <div className={`answerTimerFill${low ? ' answerTimerFill--low' : ''}`} style={{ transform: `scaleX(${timer.fraction})` }} />
    </div>
  )
}
