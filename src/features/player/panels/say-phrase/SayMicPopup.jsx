import { useEffect, useRef } from 'react'
import { Mic } from 'lucide-react'
import SayCantIcon from './SayCantIcon.jsx'
import {
  EXPLAIN_TITLE, EXPLAIN_LINES, EXPLAIN_BTN, EXPLAIN_SHORT_TITLE, EXPLAIN_SHORT_LINES, EXPLAIN_SHORT_BTN,
  INTRO_TITLE, INTRO_LINES, INTRO_BTN, EXPLAIN_CANT, EXPLAIN_LATER, CANT_SPEAK_LINK,
} from '../../../../shared/lib/speech/sayTexts.js'

const NBSP = ' ' // «на [иконка] в»: предлог, иконка и следующее слово не рвутся на строки
const SWALLOW_MS = 600 // сколько после тапа мимо окна глушим следующий click (чтобы он не долетел до круга/ленты под окном)
const TEXTS = {
  full: { title: EXPLAIN_TITLE, lines: EXPLAIN_LINES, btn: EXPLAIN_BTN },
  short: { title: EXPLAIN_SHORT_TITLE, lines: EXPLAIN_SHORT_LINES, btn: EXPLAIN_SHORT_BTN },
  intro: { title: INTRO_TITLE, lines: INTRO_LINES, btn: INTRO_BTN },
}

// Попап ПЕРЕД записью — карточка-«облако» НАД модулем (с воздухом: отступы 20+, зазоры 14–16, кнопки 48px) (тексты — sayTexts.js). Лежит ВНУТРИ панели (.sayPanel — position: fixed), абсолютно, bottom: 100% + зазор: высоту панели и раскладку не двигает,
// круг не перекрывает, с краёв экрана ≥ 12px, внизу маленький хвостик-стрелка к модулю. Показывается сам через секунду после появления модуля (sayAutoPopup.js, useSayAutoPopup.js) или по тапу на круг.
// Состав: значок микрофона и заголовок в одной строке, одна короткая строка пояснения, блок про «Я не могу говорить» с мини-иконкой кнопки (SayCantIcon — та же, что в SayActions), внизу в ряд
// тихая «Не сейчас» и основная кнопка. kind (sayPermission.pickExplainKind): 'full' — первый раз, дальше системный запрос ОС | 'short' — перед каждым следующим ожидаемым запросом ОС | 'intro' — ВВОДНЫЙ:
// системного запроса не будет (доступ уже есть / платформа не спрашивает), кнопка «Понятно, начать». Системный диалог ОС (iOS/Android) встроить в своё окно или стилизовать нельзя — его рисует ОС; мы показываем
// свой попап до него и вызываем диалог ТОЛЬКО по кнопке внутри попапа (recognition.start() — в её тапе, жест сохраняется; см. useSayPhrase.confirmExplain), сам автопоказ микрофон не трогает.
// Закрытие: «Не сейчас», тап мимо карточки (глушим и сам тап, и следующий click — как у окошек худа, useHudOutsideDismiss) или Esc: во всех случаях ничего не просим и флагов не ставим.
// Появление — пружинка popSpringIn, уход — короткое растворение (closing — карточка уже уходит, классы --out); без затемнения, blur и теней. data-no-unlock на корне: тап основной кнопки сразу стартует
// запись, разблокировка звука (беззвучный wav) на нём запрещена.
export default function SayMicPopup({ kind = 'full', closing, onConfirm, onCancel }) {
  const k = TEXTS[kind] ? kind : 'full'
  const { title, lines, btn } = TEXTS[k]
  const cardRef = useRef(null)
  useEffect(() => {
    if (closing) return undefined
    const onKey = e => { if (e.key === 'Escape') onCancel() }
    const swallow = e => { e.stopPropagation(); e.preventDefault() }
    const onDown = e => {
      if (cardRef.current?.contains(e.target)) return
      e.stopPropagation()
      e.preventDefault()
      document.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => document.removeEventListener('click', swallow, true), SWALLOW_MS)
      onCancel()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown, true)
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown, true) }
  }, [closing, onCancel])
  return (
    <div className={`sayPopRoot${closing ? ' sayPopRoot--out' : ''}`} data-no-unlock="" data-testid="say-mic-popup" data-kind={k}>
      <div ref={cardRef} className={`sayPopCard${closing ? ' sayPopCard--out' : ''}`} role="dialog" aria-label={title}>
        <div className="sayPopHead">
          <span className="sayPopIcon" aria-hidden="true"><Mic size={16} /></span>
          <h2 className="sayPopTitle" data-testid="say-pop-title">{title}</h2>
        </div>
        <div className="sayPopBody" data-testid="say-pop-text">
          <p className="sayPopText">{lines.join(' ')}</p>
          <p className="sayPopBlock sayPopBlock--cant" data-testid="say-pop-cant">
            {EXPLAIN_CANT[0]}{NBSP}
            <span className="sayPopNoBreak">
              <span className="sayPopCantIcon" aria-hidden="true"><SayCantIcon size={17} strokeWidth={2.1} /></span>
              <span className="sayPopSr">«{CANT_SPEAK_LINK}»</span>
              {NBSP}{EXPLAIN_CANT[1]}
            </span>
            {' '}{EXPLAIN_CANT[2]}
          </p>
        </div>
        <div className="sayPopActions">
          <button type="button" className="sayPopLater" onClick={onCancel} disabled={closing} data-testid="say-pop-later">{EXPLAIN_LATER}</button>
          <button type="button" className="phraseCheckBtn sayPopBtn" onClick={onConfirm} disabled={closing}>{btn}</button>
        </div>
        <span className="sayPopTail" aria-hidden="true" />
      </div>
    </div>
  )
}
