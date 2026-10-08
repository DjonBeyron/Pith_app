import { THANKS_COPY } from './minutesFlow.js'

// Экран «Спасибо» после выбора минут (онбординг): тёплое сообщение и три
// мягко пульсирующие точки. minHeight — высота вопроса, чтобы шторка не прыгала
export default function MinutesThanks({ minHeight }) {
  return (
    <div className="lrThanks" role="status" style={minHeight ? { minHeight } : undefined}>
      <p className="lrSheetWord">{THANKS_COPY.title}</p>
      <p className="lrSheetPhrase">{THANKS_COPY.lead}</p>
      <div className="lrThanksDots" aria-hidden="true"><i /><i /><i /></div>
    </div>
  )
}
