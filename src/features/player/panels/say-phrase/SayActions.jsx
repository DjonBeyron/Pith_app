import { Volume2 } from 'lucide-react'
import { EXPLAIN_BTN } from '../../../../shared/lib/speech/sayTexts.js'

// Нижняя часть панели: ряд главных кнопок (.phraseCheckBtn — единый вид «Проверить» всех панелей) и тихий ряд
// «Послушать» / «Не могу говорить». Оба ряда есть в DOM всегда (скрытые — visibility), высота панели не меняется.
//  explain  — «Понятно, включить микрофон» (диалог ОС вызовется уже по этому тапу)
//  failed   — «Ещё раз» (пока есть попытки) и «Получилось» (самооценка)
//  fallback — «Получилось» (микрофона не будет: отказ, нет распознавания, «Не могу говорить»)
export default function SayActions({ phase, canRetry, canListen, listenBusy, closing, onExplain, onRetry, onSelfOk, onListen, onSkip }) {
  const showRetry = phase === 'failed' && canRetry
  const showSelf = phase === 'failed' || phase === 'fallback'
  const mainVisible = phase === 'explain' || showSelf
  return (
    <>
      <div className={`sayActions${mainVisible ? '' : ' sayActions--off'}`}>
        {phase === 'explain' ? (
          <div className="sayActionCell"><button type="button" className="phraseCheckBtn" onClick={onExplain}>{EXPLAIN_BTN}</button></div>
        ) : (
          <>
            {showRetry && <div className="sayActionCell"><button type="button" className="phraseCheckBtn" onClick={onRetry}>Ещё раз</button></div>}
            {showSelf && <div className="sayActionCell"><button type="button" className="phraseCheckBtn" onClick={onSelfOk} disabled={closing}>Получилось</button></div>}
          </>
        )}
      </div>
      <div className="sayFoot">
        <button type="button" className={`sayLink${canListen ? '' : ' sayLink--off'}`} onClick={onListen} disabled={!canListen}>
          <Volume2 size={15} aria-hidden="true" />
          {listenBusy ? 'Стоп' : 'Послушать'}
        </button>
        <button type="button" className="sayLink" onClick={onSkip} disabled={closing}>Не могу говорить</button>
      </div>
    </>
  )
}
