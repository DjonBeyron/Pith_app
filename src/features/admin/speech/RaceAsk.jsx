import { askText, CHOICES, CHOICE_LABELS } from '../../pitrace/raceAskVoice.js'
import PolishListen from './PolishListen.jsx'
import '../../../styles/admin-race-ask.css'

// Плашка-вопрос перед стартом гонки (Пит: race_ask_voice) в стиле плашек игры (word-lane-plate.css: тот же класс .wlTurn — узор, рамка, рост из центра). Две кнопки «Говорю» / «Тапаю»; прошлый выбор подсвечен.
// url — озвучка реплики (если есть): «Послушать». Решает useRaceAsk.js: выбор — тап по кнопке, а это жест для микрофона и звука.
export default function RaceAsk({ choice, url = null, onPick, onCancel }) {
  return (
    <div className="raceAsk" role="dialog" aria-modal="true" aria-label="Сможешь говорить?" data-testid="race-ask" onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="wlTurn raceAskPlate" data-testid="race-ask-plate">
        <p className="raceAskText" data-testid="race-ask-text">{askText()}</p>
        {url && <div className="raceAskListen"><PolishListen url={url} testid="race-ask-listen" /></div>}
        <div className="raceAskBtns">
          {CHOICES.map(c => <button key={c} type="button" className="raceAskBtn" data-main={c === choice ? '1' : undefined} onClick={() => onPick(c)} data-testid={`race-ask-${c}`}>{CHOICE_LABELS[c]}</button>)}
        </div>
        <button type="button" className="raceAskCancel" onClick={onCancel} data-testid="race-ask-cancel">Отмена</button>
      </div>
    </div>
  )
}
