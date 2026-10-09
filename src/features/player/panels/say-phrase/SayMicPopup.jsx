import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Mic } from 'lucide-react'
import { EXPLAIN_TEXT, EXPLAIN_BTN } from '../../../../shared/lib/speech/sayTexts.js'

// Попап-пояснение ПЕРЕД системным диалогом микрофона (pre-permission), по центру экрана. Системный диалог ОС (iOS/Android)
// встроить в своё окно или стилизовать нельзя — его рисует ОС; мы показываем свой попап до него и вызываем диалог по кнопке
// внутри попапа (recognition.start() — в её тапе, жест сохраняется; см. useSayPhrase.confirmExplain).
// Вид и анимации — как у попапа игрока в «Рейтинге» и окошек худа: «пружинка» popSpringIn при открытии, схлопывание hudPopOut
// с заливкой при закрытии, затемнение — отдельный слой РЯДОМ с окном (плавный opacity), без blur/backdrop-filter. Закрытие:
// кнопка, тап мимо окна (ничего не просим, пояснение покажем снова) или Esc. closing — окно уже схлопывается (классы --out).
export default function SayMicPopup({ closing, onConfirm, onCancel }) {
  useEffect(() => {
    if (closing) return undefined
    const onKey = e => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closing, onCancel])
  return createPortal(
    <div className={`sayPopRoot${closing ? ' sayPopRoot--out' : ''}`} onClick={closing ? undefined : onCancel} data-testid="say-mic-popup">
      <div className={`sayPopDim${closing ? ' sayPopDim--out' : ''}`} aria-hidden="true" />
      <div
        className={`sayPopCard${closing ? ' sayPopCard--out' : ''}`}
        role="dialog" aria-modal="true" aria-label="Нужен микрофон"
        onClick={e => e.stopPropagation()}
      >
        <span className="sayPopIcon" aria-hidden="true"><Mic size={26} /></span>
        <p className="sayPopText">{EXPLAIN_TEXT}</p>
        <button type="button" className="phraseCheckBtn sayPopBtn" onClick={onConfirm} disabled={closing}>{EXPLAIN_BTN}</button>
      </div>
    </div>,
    document.body,
  )
}
