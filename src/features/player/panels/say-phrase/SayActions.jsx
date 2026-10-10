import { Volume2, Mic, SkipForward } from 'lucide-react'
import { CANT_SPEAK_LINK } from '../../../../shared/lib/speech/sayTexts.js'

// Нижняя часть панели «Сказать фразу»: «Послушать» слева (тихая ссылка), справа «Включить» (только если микрофон выключили кнопкой «Я не могу говорить»)
// и КНОПКА-ИКОНКА «Я не могу говорить» (SkipForward — «пропустить») в правом углу, чуть выше нижней строки (say-phrase.css). Без текста: aria-label и title
// «Я не могу говорить», круглая 38px приглушённая, зона касания ≥ 44px (::after). Та же иконка стоит в мини-виде в попапе разрешения (SayMicPopup). Пока кнопка микрофона — квадрат,
// пока идёт запись или итог, иконка плавно гаснет (hideSkip, opacity; место не схлопывается, касания не принимает). Скрытые элементы остаются в DOM (visibility):
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
      <div className="sayFootSide sayFootSide--end">
        {canEnable && (
          <button type="button" className="sayLink" onClick={onEnable} aria-label="Включить микрофон">
            <Mic size={14} aria-hidden="true" />Включить
          </button>
        )}
      </div>
      <button
        type="button"
        className={`saySkipBtn${hideSkip ? ' saySkipBtn--hidden' : ''}`}
        onClick={onSkip}
        tabIndex={hideSkip ? -1 : undefined}
        disabled={closing}
        aria-label={CANT_SPEAK_LINK}
        title={CANT_SPEAK_LINK}
        data-testid="say-skip"
      >
        <SkipForward size={18} strokeWidth={2.2} aria-hidden="true" />
      </button>
    </div>
  )
}
