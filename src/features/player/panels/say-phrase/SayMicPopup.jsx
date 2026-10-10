import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Mic, SkipForward } from 'lucide-react'
import {
  EXPLAIN_TITLE, EXPLAIN_LINES, EXPLAIN_BTN, EXPLAIN_SHORT_TITLE, EXPLAIN_SHORT_LINES, EXPLAIN_SHORT_BTN,
  INTRO_TITLE, INTRO_LINES, INTRO_BTN, EXPLAIN_CANT, EXPLAIN_LATER, CANT_SPEAK_LINK,
} from '../../../../shared/lib/speech/sayTexts.js'

const NBSP = '\u00a0' // «Нажмите [иконка] —»: слово, иконка и тире не рвутся на строки
const TEXTS = {
  full: { title: EXPLAIN_TITLE, lines: EXPLAIN_LINES, btn: EXPLAIN_BTN },
  short: { title: EXPLAIN_SHORT_TITLE, lines: EXPLAIN_SHORT_LINES, btn: EXPLAIN_SHORT_BTN },
  intro: { title: INTRO_TITLE, lines: INTRO_LINES, btn: INTRO_BTN },
}

// Попап ПЕРЕД записью, по центру экрана (тексты — sayTexts.js; вёрстка в духе окошка «Временная память»: значок вверху, заголовок 16/800, вводная строка, компактные блоки с цветной полоской слева).
// Состав: значок микрофона, заголовок, вводная строка, блок «как это работает» и блок про «Я не могу говорить» с мини-иконкой кнопки (та же SkipForward, что в SayActions), основная кнопка и тихая «Не сейчас».
// kind (sayPermission.pickExplainKind): 'full' — первый раз, дальше системный запрос ОС | 'short' — перед каждым следующим ожидаемым запросом ОС | 'intro' — ВВОДНЫЙ: системного запроса не будет
// (доступ уже есть / платформа не спрашивает), кнопка «Понятно, начать». Системный диалог ОС (iOS/Android) встроить в своё окно или стилизовать нельзя — его рисует ОС; мы показываем свой попап до него
// и вызываем диалог по кнопке внутри попапа (recognition.start() — в её тапе, жест сохраняется; см. useSayPhrase.confirmExplain).
// Вид и анимации — как у попапа игрока в «Рейтинге» и окошек худа: «пружинка» popSpringIn при открытии, схлопывание hudPopOut
// с заливкой при закрытии, затемнение — отдельный слой РЯДОМ с окном (плавный opacity), без blur/backdrop-filter. Закрытие:
// кнопка «Не сейчас», тап мимо окна или Esc (во всех трёх случаях ничего не просим и флагов не ставим — попап покажем снова). closing — окно уже схлопывается (классы --out).
// data-no-unlock на корне: тап основной кнопки сразу стартует запись, разблокировка звука (беззвучный wav) на нём запрещена.
export default function SayMicPopup({ kind = 'full', closing, onConfirm, onCancel }) {
  const k = TEXTS[kind] ? kind : 'full'
  const { title, lines, btn } = TEXTS[k]
  useEffect(() => {
    if (closing) return undefined
    const onKey = e => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closing, onCancel])
  return createPortal(
    <div className={`sayPopRoot${closing ? ' sayPopRoot--out' : ''}`} onClick={closing ? undefined : onCancel} data-no-unlock="" data-testid="say-mic-popup" data-kind={k}>
      <div className={`sayPopDim${closing ? ' sayPopDim--out' : ''}`} aria-hidden="true" />
      <div
        className={`sayPopCard${closing ? ' sayPopCard--out' : ''}`}
        role="dialog" aria-modal="true" aria-label={title}
        onClick={e => e.stopPropagation()}
      >
        <span className="sayPopIcon" aria-hidden="true"><Mic size={24} /></span>
        <h2 className="sayPopTitle" data-testid="say-pop-title">{title}</h2>
        <div className="sayPopBody" data-testid="say-pop-text">
          <p className="sayPopText sayPopLead">{lines[0]}</p>
          <p className="sayPopBlock">{lines[1]}</p>
          <p className="sayPopBlock sayPopBlock--cant" data-testid="say-pop-cant">
            {EXPLAIN_CANT[0]}{NBSP}
            <span className="sayPopNoBreak">
              <span className="sayPopCantIcon" aria-hidden="true"><SkipForward size={13} strokeWidth={2.4} /></span>
              <span className="sayPopSr">«{CANT_SPEAK_LINK}»</span>
              {NBSP}{EXPLAIN_CANT[1]}
            </span>
            {' '}{EXPLAIN_CANT[2]}
          </p>
        </div>
        <button type="button" className="phraseCheckBtn sayPopBtn" onClick={onConfirm} disabled={closing}>{btn}</button>
        <button type="button" className="sayPopLater" onClick={onCancel} disabled={closing} data-testid="say-pop-later">{EXPLAIN_LATER}</button>
      </div>
    </div>,
    document.body,
  )
}
