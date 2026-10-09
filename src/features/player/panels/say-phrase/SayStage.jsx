import { Mic, MicOff, Square } from 'lucide-react'

// Середина панели «Сказать фразу»: большая круглая кнопка микрофона и статус-строки под ней. Высота блока постоянна
// во всех состояниях (CSS .sayStage/.sayInfo): тексты внутри меняются, раскладка не прыгает.
// Анимация «слушаю» — пульсирующий ободок (.sayMicPulse): только opacity + transform, без blur/filter/box-shadow.
// busy — пока ждём диалог/обрабатываем: кнопка спокойная; нажатие во время записи = «стоп» (принять сказанное).
// off — микрофона не будет (отказ, нет распознавания, «Не могу говорить»): кнопка перечёркнута и не нажимается.
export default function SayStage({ info, listening, busy, off, disabled, onTap, extra = null }) {
  const cls = `sayMic${listening ? ' sayMic--listening' : ''}${busy && !listening ? ' sayMic--busy' : ''}${off ? ' sayMic--off' : ''}`
  return (
    <div className="sayStage">
      <button
        type="button"
        className={cls}
        onClick={onTap}
        disabled={disabled || off}
        aria-label={listening ? 'Остановить запись' : 'Сказать фразу'}
      >
        {listening && <><span className="sayMicPulse" aria-hidden="true" /><span className="sayMicPulse sayMicPulse--b" aria-hidden="true" /></>}
        {listening ? <Square size={24} fill="currentColor" /> : off ? <MicOff size={28} /> : <Mic size={30} />}
      </button>
      <div className="sayInfo" aria-live="polite">
        <p className={`sayStatus sayStatus--${info.tone}`} data-testid="say-status">{info.status}</p>
        {info.hint && <p className="sayHint" data-testid="say-hint">{info.hint}</p>}
        {extra}
        {info.heard && <p className="sayHeard" data-testid="say-heard">{info.heard}</p>}
      </div>
    </div>
  )
}
