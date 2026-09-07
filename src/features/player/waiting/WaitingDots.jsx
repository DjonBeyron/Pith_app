// Индикатор «учитель печатает / записывает» — рисуется на время фиксированной
// паузы TYPING_DELAY_MS перед следующим сообщением (см. useGraphPlayer.js,
// scheduleReveal). Показывается только для типов, которые в жизни человек
// реально «набирает»: текст, голосовое, видео-кружок. Для фото/стикера/
// системных/интерактивных нод — не нужен, они появляются мгновенно.
const VARIANTS = { text: 'dots', audio: 'wave', circle: 'rec' }

export default function WaitingDots({ visible, type }) {
  const variant = visible ? VARIANTS[type] : null
  if (!variant) return null

  return (
    <div className="playerWaitingRow">
      <div className={`playerWaitingBubble playerWaitingBubble--${variant}`}>
        {variant === 'dots' && (
          <span className="playerWaitingDots"><i /><i /><i /></span>
        )}
        {variant === 'wave' && (
          <span className="playerWaitingWave"><i /><i /><i /><i /></span>
        )}
        {variant === 'rec' && (
          <span className="playerWaitingRec"><i /></span>
        )}
      </div>
    </div>
  )
}
