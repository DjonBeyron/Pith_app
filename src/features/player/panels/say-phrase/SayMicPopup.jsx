import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Mic } from 'lucide-react'
import {
  EXPLAIN_TITLE, EXPLAIN_LINES, EXPLAIN_BTN, EXPLAIN_SHORT_TITLE, EXPLAIN_SHORT_LINES, EXPLAIN_SHORT_BTN, EXPLAIN_LATER,
} from '../../../../shared/lib/speech/sayTexts.js'

// Попап ПЕРЕД системным диалогом микрофона (pre-permission), по центру экрана: заголовок, 2–3 короткие фразы, основная кнопка и тихая «Не сейчас» (тексты — sayTexts.js).
// kind: 'full' — самый первый раз на устройстве (зачем доступ именно в этом задании, один раз, «не записываем и не сохраняем звук»), 'short' — перед каждым следующим ожидаемым запросом ОС. Системный диалог ОС (iOS/Android)
// встроить в своё окно или стилизовать нельзя — его рисует ОС; мы показываем свой попап до него и вызываем диалог по кнопке
// внутри попапа (recognition.start() — в её тапе, жест сохраняется; см. useSayPhrase.confirmExplain).
// Вид и анимации — как у попапа игрока в «Рейтинге» и окошек худа: «пружинка» popSpringIn при открытии, схлопывание hudPopOut
// с заливкой при закрытии, затемнение — отдельный слой РЯДОМ с окном (плавный opacity), без blur/backdrop-filter. Закрытие:
// кнопка «Не сейчас», тап мимо окна или Esc (во всех трёх случаях ничего не просим и флагов не ставим — попап покажем снова). closing — окно уже схлопывается (классы --out).
// data-no-unlock на корне: тап «Разрешить доступ» / «Продолжить» сразу стартует запись, разблокировка звука (беззвучный wav) на нём запрещена.
export default function SayMicPopup({ kind = 'full', closing, onConfirm, onCancel }) {
  const short = kind === 'short'
  const title = short ? EXPLAIN_SHORT_TITLE : EXPLAIN_TITLE
  const lines = short ? EXPLAIN_SHORT_LINES : EXPLAIN_LINES
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
        role="dialog" aria-modal="true" aria-label={title}
        onClick={e => e.stopPropagation()}
      >
        <span className="sayPopIcon" aria-hidden="true"><Mic size={26} /></span>
        <h2 className="sayPopTitle" data-testid="say-pop-title">{title}</h2>
        <div className="sayPopBody" data-testid="say-pop-text">
          {lines.map(line => <p key={line} className="sayPopText">{line}</p>)}
        </div>
        <button type="button" className="phraseCheckBtn sayPopBtn" onClick={onConfirm} disabled={closing}>{short ? EXPLAIN_SHORT_BTN : EXPLAIN_BTN}</button>
        <button type="button" className="sayPopLater" onClick={onCancel} disabled={closing} data-testid="say-pop-later">{EXPLAIN_LATER}</button>
      </div>
    </div>,
    document.body,
  )
}
