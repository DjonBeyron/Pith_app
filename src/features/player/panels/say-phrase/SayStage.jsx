import { useRef, useState } from 'react'
import { Mic, MicOff, Check, X, Square } from 'lucide-react'
import { LISTENING, STOP } from '../../../../shared/lib/speech/sayTexts.js'
import { isSquareMode } from '../../../../shared/lib/speech/sayMic.js'
import { useSayRings } from './useSayRings.js'

// Середина панели «Сказать фразу»: кнопка микрофона в области ФИКСИРОВАННОЙ высоты (.sayMicBox, ровно по центру высоты панели).
// Кнопка — ОДИН элемент, который морфится: зелёный прямоугольник «Нажмите, чтобы говорить» → (сужается до ширины квадрата, потом
// пружинит до квадрата с перелётом, «эффект резины») КВАДРАТ → обратно (sayMorph.js, say-phrase-mic.css). Иконка и текст
// прямоугольника не едут, а гаснут (opacity); в квадрате проступают две половины, разделённые линией: сверху индикатор «Слушаю»
// (иконка слева, текст справа, нажатий не принимает), снизу кнопка остановки «Стоп» (тап = стоп). Вокруг квадрата — три полупрозрачных
// кольца, которые следуют за голосом (useSayRings: уровень пишется в CSS-переменные без ререндеров). Внутри панели нет подсказок.
// Режимы (mode из micLabel в sayMic.js):
//  idle прямоугольник | prep квадрат формируется, «Слушаю» ещё нет (кольца «дышат») | listening квадрат «Слушаю» / «Стоп», кольца за голосом |
//  ok квадрат остаётся: галочка и «Верно» | fail квадрат с крестиком на красноватом фоне (FAIL_HOLD_MS), затем снова idle |
//  off «Микрофон выключен» (перечёркнутая иконка).
// attempts — «Попытка N» справа от кнопки (после первой неудачи). data-no-unlock: тап по микрофону не запускает разблокировку звука
// (sounds.js/primedAudio.js) — она ставила бы аудиосессию в игру ровно в момент старта записи.
export default function SayStage({ label, mode, voice, disabled, attempts, onTap }) {
  const off = mode === 'off'
  const square = isSquareMode(mode)
  const ringsRef = useRef(null)
  // Подпись прямоугольника держим прежней, пока кнопка — квадрат: текст гаснет вместе со слоем, а не «схлопывается»
  const [rectLabel, setRectLabel] = useState(label)
  if (!square && rectLabel !== label) setRectLabel(label)
  // Квадрат уже был — значит, при выходе из него играем обратный морфинг (на первом показе анимации нет)
  const [wasSquare, setWasSquare] = useState(false)
  if (square && !wasSquare) setWasSquare(true)
  const morph = square ? ' sayMicBtn--in' : wasSquare ? ' sayMicBtn--out' : ''
  // Что нарисовано в слое итога — помним до конца затухания (после перехода в idle слой плавно гаснет вместе с красным фоном)
  const [result, setResult] = useState({ mode: null, label: '' })
  if ((mode === 'ok' || mode === 'fail') && (result.mode !== mode || result.label !== label)) setResult({ mode, label })
  const [attemptText, setAttemptText] = useState(attempts)
  if (attempts && attemptText !== attempts) setAttemptText(attempts)

  useSayRings(ringsRef, { on: mode === 'prep' || mode === 'listening', listening: mode === 'listening', voice })

  const aria = mode === 'listening' ? 'Остановить запись' : mode === 'ok' ? result.label : square ? LISTENING : rectLabel
  return (
    <div className={`sayMicBox sayMicBox--${mode}`}>
      <span ref={ringsRef} className="sayRings" aria-hidden="true" data-testid="say-rings">
        <i className="sayRing sayRing1" /><i className="sayRing sayRing2" /><i className="sayRing sayRing3" />
      </span>
      <button
        type="button"
        className={`phraseCheckBtn sayMicBtn sayMicBtn--${mode}${morph}`}
        onClick={onTap}
        disabled={disabled || off}
        aria-label={aria}
        data-no-unlock=""
        data-testid="say-mic"
        data-mode={mode}
      >
        <span className="sayRed" aria-hidden="true" />
        <span className="sayRectLayer">
          {off ? <MicOff className="sayMicIcon" size={22} aria-hidden="true" /> : <Mic className="sayMicIcon" size={22} aria-hidden="true" data-testid="say-mic-icon" />}
          <span className="sayMicText" data-testid="say-mic-label">{rectLabel}</span>
        </span>
        <span className="sayCells" aria-hidden="true" data-testid="say-cells">
          <span className="sayCell sayCellTop">
            <span className="sayCellIcon"><Mic size={24} /></span>
            <span className="sayCellText" data-testid="say-listening">{LISTENING}</span>
          </span>
          <i className="sayDivider" />
          <span className="sayCell sayCellStop" data-testid="say-stop">
            <span className="sayCellIcon"><Square size={17} fill="currentColor" /></span>
            <span className="sayCellText">{STOP}</span>
          </span>
        </span>
        <span className="sayResult" aria-hidden="true" data-testid="say-result" data-kind={result.mode}>
          {result.mode === 'fail' ? <X size={54} strokeWidth={3.2} /> : <Check size={46} strokeWidth={3.2} />}
          {result.mode === 'ok' && <span className="sayResultText">{result.label}</span>}
        </span>
      </button>
      <span className={`sayAttempt${attempts ? ' sayAttempt--on' : ''}`} data-testid="say-attempt" aria-live="off">{attemptText}</span>
    </div>
  )
}
