import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Mic } from 'lucide-react'
import { EXPLAIN_TEXT, EXPLAIN_BTN, EXPLAIN_SHORT_TEXT, EXPLAIN_SHORT_BTN } from '../../../../shared/lib/speech/sayTexts.js'

// Попап ПЕРЕД системным диалогом микрофона (pre-permission), по центру экрана. kind: 'full' — самый первый раз на устройстве (зачем нужен
// микрофон, «не записываем и не сохраняем звук»), 'short' — перед каждым следующим ожидаемым запросом ОС («Сейчас появится запрос…»). Системный диалог ОС (iOS/Android)
// встроить в своё окно или стилизовать нельзя — его рисует ОС; мы показываем свой попап до него и вызываем диалог по кнопке
// внутри попапа (recognition.start() — в её тапе, жест сохраняется; см. useSayPhrase.confirmExplain).
// Вид и анимации — как у попапа игрока в «Рейтинге» и окошек худа: «пружинка» popSpringIn при открытии, схлопывание hudPopOut
// с заливкой при закрытии, затемнение — отдельный слой РЯДОМ с окном (плавный opacity), без blur/backdrop-filter. Закрытие:
// кнопка, тап мимо окна (ничего не просим, флагов не ставим — попап покажем снова) или Esc. closing — окно уже схлопывается (классы --out).
// data-no-unlock на корне: тап «Понятно, включить микрофон» сразу стартует запись, разблокировка звука (беззвучный wav) на нём запрещена.
export default function SayMicPopup({ kind = 'full', closing, onConfirm, onCancel }) {
  const short = kind === 'short'
  useEffect(() => {
    if (closing) return undefined
    const onKey = e => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closing, onCancel])
  return createPortal(
    <div className={`sayPopRoot${closing ? ' sayPopRoot--out' : ''}`} onClick={closing ? undefined : onCancel} data-no-unlock="" data-testid="say-mic-popup" data-kind={short ? 'short' : 'full'}>
      <div className={`sayPopDim${closing ? ' sayPopDim--out' : ''}`} aria-hidden="true" />
      <div
        className={`sayPopCard${closing ? ' sayPopCard--out' : ''}`}
        role="dialog" aria-modal="true" aria-label="Нужен микрофон"
        onClick={e => e.stopPropagation()}
      >
        <span className="sayPopIcon" aria-hidden="true"><Mic size={26} /></span>
        <p className="sayPopText" data-testid="say-pop-text">{short ? EXPLAIN_SHORT_TEXT : EXPLAIN_TEXT}</p>
        <button type="button" className="phraseCheckBtn sayPopBtn" onClick={onConfirm} disabled={closing}>{short ? EXPLAIN_SHORT_BTN : EXPLAIN_BTN}</button>
      </div>
    </div>,
    document.body,
  )
}
