import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { isWeakDevice } from '../../shared/lib/deviceTier.js'
import { askText, CHOICES, CHOICE_LABELS } from './raceAskVoice.js'

// Попап «звуком или тапами?» ВНУТРИ игры «Гонка с Питом» (CONCEPT_RACE.md, «Попап внутри игры»). Кнопка в админ-блоке (и карточка игры) только открывает сцену игры на весь экран: тот же корень .wl и сцена .wlStage с узором фона,
// что у самой игры, но игры ещё нет — Пит не выскочил, заставки нет, реплик нет, конвейера нет, микрофон и звук не тронуты. Пока человек не ответил, ничего не начинается. Плашка — стиль плашек игры (.wlTurn: узор, рамка, рост из центра).
// «Говорю» / «Тапаю» — свежий жест: из этого обработчика RotatePhoneModule запускает startGameAudio (микрофон, звук, ворота) и открывает игру (pick в RotatePhoneModule.jsx). Прошлый выбор подсвечен. Крестик — выйти, не отвечая.
export function RaceAskScene({ choice, onPick, onCancel, lite = false }) {
  return (
    <div className="wl" data-phase="ask" data-testid="race-ask-scene">
      <div className="wlStage" data-tex={lite ? undefined : ''}>
        <div className="wlTurn raceAskPlate" role="dialog" aria-modal="true" aria-label="Сможешь говорить?" data-testid="race-ask-plate">
          <p className="raceAskText" data-testid="race-ask-text">{askText()}</p>
          <div className="raceAskBtns">
            {CHOICES.map(c => <button key={c} type="button" className="raceAskBtn" data-main={c === choice ? '1' : undefined} onClick={() => onPick(c)} data-testid={`race-ask-${c}`}>{CHOICE_LABELS[c]}</button>)}
          </div>
        </div>
      </div>
      <button type="button" className="wlClose" onClick={onCancel} aria-label="Закрыть" data-testid="race-ask-cancel"><X size={20} /></button>
    </div>
  )
}

/** Сцена с попапом поверх всего (portal в body, как сама игра) */
export default function RaceAskPlate(props) {
  return createPortal(<RaceAskScene {...props} lite={isWeakDevice()} />, document.body)
}
