import { Volume2, Mic } from 'lucide-react'
import { CANT_SPEAK_LINK } from '../../../../shared/lib/speech/sayTexts.js'

// Нижний ряд панели «Сказать фразу» — тихие ссылки: «Послушать» слева, «Я не могу говорить» по ЦЕНТРУ (приглушена, подчёркнута),
// справа «Включить» (только если микрофон выключили кнопкой «Я не могу говорить»). Пока кнопка микрофона — квадрат, «Я не могу говорить»
// плавно гаснет (hideSkip, opacity; место не схлопывается, касания не принимает) и возвращается с прямоугольником. Скрытые элементы остаются в DOM (visibility):
// раскладка и высота панели не меняются. «Ещё раз» и «Получилось» убраны: после неудачи просто снова доступна кнопка микрофона,
// а при отказе микрофона/недоступном распознавании единственный выход — «Я не могу говорить».
export default function SayActions({ canListen, listenBusy, closing, canEnable, hideSkip = false, onListen, onSkip, onEnable }) {
  return (
    <div className="sayFoot">
      <div className="sayFootSide">
        <button type="button" className={`sayLink${canListen ? '' : ' sayLink--off'}`} onClick={onListen} disabled={!canListen}>
          <Volume2 size={15} aria-hidden="true" />
          {listenBusy ? 'Стоп' : 'Послушать'}
        </button>
      </div>
      <button type="button" className={`saySkipLink${hideSkip ? ' saySkipLink--hidden' : ''}`} onClick={onSkip} tabIndex={hideSkip ? -1 : undefined} disabled={closing} data-testid="say-skip">{CANT_SPEAK_LINK}</button>
      <div className="sayFootSide sayFootSide--end">
        {canEnable && (
          <button type="button" className="sayLink" onClick={onEnable} aria-label="Включить микрофон">
            <Mic size={14} aria-hidden="true" />Включить
          </button>
        )}
      </div>
    </div>
  )
}
