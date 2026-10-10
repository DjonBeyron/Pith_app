import { MIC_IDLE, MIC_NEED_ACCESS, SAY_LABEL, MIC_RETRY, MIC_OFF, MIC_UNAVAILABLE } from '../../../../shared/lib/speech/sayTexts.js'

// Надпись над кругом-микрофоном («Нажмите, чтобы говорить» → «Произнесите фразу» → «Попробуйте сказать ещё раз»). Смена — плавный кросс-фейд:
// все варианты лежат в ОДНОЙ ячейке грида друг на друге, активный проявляется, остальные гаснут (opacity + лёгкий scale — как смена «перевести» ↔ перевод
// в ленте, .feedTrSwap). Какая надпись сейчас активна, решает только label из micLabel (sayMic.js), пустая (успех) — гаснут все. Тексты — sayTexts.js.
// Для скринридера видимые слои скрыты, а состояние озвучивает отдельный aria-live-элемент с текущим текстом.
const ALL = [MIC_IDLE, MIC_NEED_ACCESS, SAY_LABEL, MIC_RETRY, MIC_OFF, MIC_UNAVAILABLE]

export default function SayCaption({ label }) {
  return (
    <>
      <p className="sayCaption" aria-hidden="true" data-testid="say-caption">
        {ALL.map(text => <span key={text} className={`sayCaptionText${text === label ? ' sayCaptionText--on' : ''}`}>{text}</span>)}
      </p>
      <p className="sayCaptionLive" role="status" aria-live="polite" data-testid="say-caption-live">{label}</p>
    </>
  )
}
