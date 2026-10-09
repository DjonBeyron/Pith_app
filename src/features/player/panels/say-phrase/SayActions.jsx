import { Volume2, Mic } from 'lucide-react'
import { CANT_SPEAK_LINK } from '../../../../shared/lib/speech/sayTexts.js'

// Нижняя часть панели: ряд главных кнопок (.phraseCheckBtn — единый вид «Проверить» всех панелей) и тихий ряд ссылок.
// Оба ряда есть в DOM всегда (скрытые — visibility), высота панели не меняется.
//  failed   — «Ещё раз» (пока есть попытки) и «Получилось» (самооценка)
//  fallback — «Получилось» (микрофона не будет: отказ, нет распознавания, «Я не могу говорить»)
// Ряд ссылок: «Послушать» слева, «Я не могу говорить» по ЦЕНТРУ (подчёркнута), справа «Включить» (только в режиме без микрофона).
export default function SayActions({ phase, canRetry, canListen, listenBusy, closing, canEnable, onRetry, onSelfOk, onListen, onSkip, onEnable }) {
  const showRetry = phase === 'failed' && canRetry
  const showSelf = phase === 'failed' || phase === 'fallback'
  return (
    <>
      <div className={`sayActions${showSelf ? '' : ' sayActions--off'}`}>
        {showRetry && <div className="sayActionCell"><button type="button" className="phraseCheckBtn" onClick={onRetry}>Ещё раз</button></div>}
        {showSelf && <div className="sayActionCell"><button type="button" className="phraseCheckBtn" onClick={onSelfOk} disabled={closing}>Получилось</button></div>}
      </div>
      <div className="sayFoot">
        <div className="sayFootSide">
          <button type="button" className={`sayLink${canListen ? '' : ' sayLink--off'}`} onClick={onListen} disabled={!canListen}>
            <Volume2 size={15} aria-hidden="true" />
            {listenBusy ? 'Стоп' : 'Послушать'}
          </button>
        </div>
        <button type="button" className="saySkipLink" onClick={onSkip} disabled={closing}>{CANT_SPEAK_LINK}</button>
        <div className="sayFootSide sayFootSide--end">
          {canEnable && (
            <button type="button" className="sayLink" onClick={onEnable} aria-label="Включить микрофон">
              <Mic size={14} aria-hidden="true" />Включить
            </button>
          )}
        </div>
      </div>
    </>
  )
}
