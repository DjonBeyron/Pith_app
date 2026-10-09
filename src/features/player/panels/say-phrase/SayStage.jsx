import { Mic, MicOff, Check } from 'lucide-react'
import { LISTENING } from '../../../../shared/lib/speech/sayTexts.js'

// Середина панели «Сказать фразу»: подсказка под заголовком (.sayInfo) и кнопка микрофона в области ФИКСИРОВАННОЙ высоты (.sayMicBox,
// ровно по центру высоты панели). Кнопка — ОДИН элемент, который морфится: прямоугольник на всю ширину → круг с «Слушаю…» и
// красной точкой → обратно. Внутри слои с общей раскладкой (абсолютные, кроссфейд по opacity): ряд «иконка + подпись» (прямоугольник),
// три точки таймера «начали» и круг (иконка над «Слушаю…»). Состояния (mode из micLabel в sayStatus.js):
//  idle «Нажмите, чтобы говорить» | count три точки зажигаются по очереди (маскируют задержку старта распознавания) |
//  listening круг «Слушаю…» + красная точка | busy «Обрабатываем…» | ok «Верно!» | off «Микрофон выключен» (перечёркнутая иконка).
// Нажатие в режиме listening = «стоп» (принять сказанное). data-no-unlock: тап по микрофону не запускает разблокировку звука
// (sounds.js/primedAudio.js) — она ставила бы аудиосессию в игру ровно в момент старта записи.
export default function SayStage({ label, mode, dots, info, disabled, onTap }) {
  const off = mode === 'off'
  const Icon = off ? MicOff : mode === 'ok' ? Check : Mic
  return (
    <>
      <div className="sayInfo" aria-live="polite">
        {info.status && <p className={`sayStatus sayStatus--${info.tone}`} data-testid="say-status">{info.status}</p>}
        {info.hint && <p className="sayHint" data-testid="say-hint">{info.hint}</p>}
      </div>
      <div className={`sayMicBox sayMicBox--${mode}`}>
        <button
          type="button"
          className={`phraseCheckBtn sayMicBtn sayMicBtn--${mode}`}
          onClick={onTap}
          disabled={disabled || off}
          aria-label={mode === 'listening' ? 'Остановить запись' : label}
          data-no-unlock=""
          data-testid="say-mic"
          data-mode={mode}
        >
          {mode === 'listening' && <span className="sayMicRing" aria-hidden="true" />}
          <span className="sayMicLayer sayMicRow">
            <Icon className="sayMicIcon" size={22} aria-hidden="true" />
            <span className="sayMicText" data-testid="say-mic-label">{label}</span>
          </span>
          <span className="sayMicLayer sayMicDots" aria-hidden="true" data-testid="say-dots" data-lit={dots}>
            {[1, 2, 3].map(n => <i key={n} className={n <= dots ? 'on' : undefined} />)}
          </span>
          <span className="sayMicLayer sayMicCircle" aria-hidden="true">
            <Mic size={22} />
            <span className="sayMicCircleText">{LISTENING}</span>
          </span>
        </button>
        <span className="sayRecDot" aria-hidden="true" data-testid="say-rec-dot" />
      </div>
    </>
  )
}
