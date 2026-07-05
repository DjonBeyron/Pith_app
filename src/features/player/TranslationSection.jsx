import PlayerTypingText from './PlayerTypingText.jsx'
import HighlightedText from '../../shared/ui/HighlightedText.jsx'

// Секция перевода (про-режим). Раскрытие/свёртка — чистый CSS-трюк
// grid-template-rows 0fr↔1fr (без JS-измерений, не конфликтует с
// анимацией высоты PlayerBubble — тот просто следует за контентом).
// При свёртке контент остаётся в DOM и плавно складывается вместе с рамкой.
// Закрытие — тап/клик по самому переводу (onCollapse).
// typingKey растёт при каждом открытии — печать стартует заново;
// до первого открытия (typingKey 0) контент не рендерится.
// Компонент переиспользуемый: задел под про-режим аудио-сообщения.
export default function TranslationSection({
  open, text, highlights = [], reveal = 'type', typingKey = 0, onCollapse,
}) {
  return (
    <div
      className={`trSection${open ? ' trSectionOpen' : ''}`}
      onClick={open ? onCollapse : undefined}
      aria-hidden={!open}
    >
      <div className="trSectionInner">
        <div className="trDivider" />
        <p className="playerText">
          {typingKey > 0 && (reveal === 'type'
            ? <PlayerTypingText key={typingKey} text={text} highlights={highlights} />
            : <HighlightedText text={text} highlights={highlights} />)}
        </p>
      </div>
    </div>
  )
}
