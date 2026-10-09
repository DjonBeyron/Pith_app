import { Mic, MicOff, Check } from 'lucide-react'

// Середина панели «Сказать фразу»: кнопка-плашка микрофона на всю ширину (вид — общий .phraseCheckBtn, как «Проверить» у
// остальных панелей, высота 52px) с иконкой и подписью + строка статуса под ней. Высота блока постоянна во всех состояниях
// (CSS .sayStage/.sayInfo): тексты меняются, раскладка не прыгает. Состояния плашки (mode из micLabel в sayStatus.js):
//  idle «Нажмите, чтобы говорить» | listening «Слушаю…» (пульс иконки и ободка — только opacity/transform) |
//  busy «Обрабатываем…» | ok «Верно!» | off «Микрофон выключен» (перечёркнутая иконка, не нажимается).
// Нажатие во время записи = «стоп» (принять сказанное).
export default function SayStage({ label, mode, info, disabled, onTap }) {
  const off = mode === 'off'
  const Icon = off ? MicOff : mode === 'ok' ? Check : Mic
  return (
    <div className="sayStage">
      <button
        type="button"
        className={`phraseCheckBtn sayMicBtn sayMicBtn--${mode}`}
        onClick={onTap}
        disabled={disabled || off}
        aria-label={mode === 'listening' ? 'Остановить запись' : label}
      >
        {mode === 'listening' && <span className="sayMicRing" aria-hidden="true" />}
        <Icon className="sayMicIcon" size={22} aria-hidden="true" />
        <span className="sayMicText" data-testid="say-mic-label">{label}</span>
      </button>
      <div className="sayInfo" aria-live="polite">
        {info.status && <p className={`sayStatus sayStatus--${info.tone}`} data-testid="say-status">{info.status}</p>}
        {info.hint && <p className="sayHint" data-testid="say-hint">{info.hint}</p>}
      </div>
    </div>
  )
}
