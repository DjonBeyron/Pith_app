import { lazy, Suspense, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { isWeakDevice } from '../../shared/lib/deviceTier.js'
import { askText, CHOICES, CHOICE_LABELS, WAIT_LABELS } from './raceAskVoice.js'
import { RETRY_LABEL, isStandalone } from './raceMicHelp.js'
import RaceMicSettingsTip from './RaceMicSettingsTip.jsx'

const PillStand = lazy(() => import('../pillstand/PillStand.jsx')) // стенд пилюль (отладка) — отдельный кусок сборки, игре не нужен

// Попап «звуком или тапами?» ВНУТРИ игры «Гонка с Питом» (CONCEPT_RACE.md, «Попап внутри игры»). Кнопка в админ-блоке (и карточка игры) только открывает сцену игры на весь экран: тот же корень .wl и сцена .wlStage с узором фона,
// что у самой игры, но игры ещё нет — Пит не выскочил, заставки нет, реплик нет, конвейера нет, звука и микрофона нет (идёт только тихий прогрев, raceWarm.js). Пока человек не ответил, игра не начинается. Плашка — стиль плашек игры (.wlTurn: узор, рамка, рост из центра).
// «Говорю» / «Тапаю» — свежий жест: из этого обработчика запускается startGameAudio (pick в useRaceLaunch.js). «Говорю» ждёт микрофон здесь же: wait — подпись на кнопке («Разрешите микрофон…» / «Готовлю звук…»), обе кнопки
// неактивны (второго нажатия нет); note — до тапа: «iPhone спросит разрешение…» (первый диалог за запуск); hint — микрофон не дали (raceMicHelp.micHelp): заголовок, два абзаца (Safari / приложение с «Домой»),
// кнопки «Попробовать снова» и «Пальцами»; tip — вместо note, когда микрофон уже разрешали в двух запусках (RaceMicSettingsTip.jsx, raceMicSettingsTip.js). Прошлый выбор подсвечен. Крестик — выйти, не отвечая.
// start — только при отладке (useRaceStartStage.js): под кнопками «Начать с: …» ({ options, value, onChange }) и кнопка «🧪 Стенд пилюль» (onStand, features/pillstand); null — ничего не рисуется.
const label = (c, wait, hint) => (wait && c === 'voice' ? WAIT_LABELS[wait] : hint && c === 'voice' ? RETRY_LABEL : CHOICE_LABELS[c])

export function RaceAskScene({ choice, onPick, onCancel, start = null, onStand = null, wait = null, hint = null, note = '', tip = false, onTipClose = null, text = '', lite = false }) {
  return (
    <div className="wl" data-phase="ask" data-testid="race-ask-scene">
      <div className="wlStage" data-tex={lite ? undefined : ''}>
        <div className="wlTurn raceAskPlate" role="dialog" aria-modal="true" aria-label="Как будешь ловить слова?" data-testid="race-ask-plate">
          <p className="raceAskText" data-testid="race-ask-text">{hint ? hint.title : (text || askText())}</p>
          {hint && <div className="raceAskHint" role="alert" data-testid="race-ask-hint" data-mic={hint.mic}>{hint.paras.map(p => <p key={p.id} className="raceAskHelp" data-current={p.current ? '1' : undefined} data-testid={`race-ask-help-${p.id}`}>{p.text}</p>)}</div>}
          <div className="raceAskBtns">
            {CHOICES.map(c => <button key={c} type="button" className="raceAskBtn" data-main={c === choice ? '1' : undefined} data-wait={wait && c === 'voice' ? wait : undefined} disabled={!!wait} onClick={() => onPick(c)} data-testid={`race-ask-${c}`}>{label(c, wait, hint)}</button>)}
          </div>
          {start && <label className="raceAskStart" data-testid="race-ask-start"><span>Начать с:</span><select value={start.value} disabled={!!wait} onChange={e => start.onChange(e.target.value)} data-testid="race-ask-start-select"><option value="">с начала</option>{start.options.map(o => <option key={o.sid} value={o.sid}>{o.label}</option>)}</select></label>}
          {start && onStand && <button type="button" className="raceAskStand" disabled={!!wait} onClick={onStand} data-testid="race-ask-stand">🧪 Стенд пилюль</button>}
          {!hint && tip && <RaceMicSettingsTip standalone={isStandalone()} onClose={onTipClose} />}
          {!hint && !tip && note && <p className="raceAskNote" data-testid="race-ask-note">{note}</p>}
        </div>
      </div>
      <button type="button" className="wlClose" onClick={onCancel} aria-label="Закрыть" data-testid="race-ask-cancel"><X size={20} /></button>
    </div>
  )
}

/** Сцена с попапом поверх всего (portal в body, как сама игра); при отладке — вместо неё стенд пилюль, пока он открыт */
export default function RaceAskPlate(props) {
  const [stand, setStand] = useState(false)
  if (stand && props.start) return <Suspense fallback={null}><PillStand onClose={() => setStand(false)} /></Suspense>
  return createPortal(<RaceAskScene {...props} onStand={props.start ? () => setStand(true) : null} lite={isWeakDevice()} />, document.body)
}
