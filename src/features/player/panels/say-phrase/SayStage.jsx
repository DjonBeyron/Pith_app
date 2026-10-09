import { useRef, useState, useLayoutEffect } from 'react'
import { Mic, MicOff, Check } from 'lucide-react'
import { LISTENING } from '../../../../shared/lib/speech/sayTexts.js'
import { useSayRings } from './useSayRings.js'

const ICON_GAP = 10 // зазор «иконка — текст» в прямоугольнике (совпадает с .sayMicRow gap)

// Середина панели «Сказать фразу»: кнопка микрофона в области ФИКСИРОВАННОЙ высоты (.sayMicBox = диаметр круга, ровно по центру
// высоты панели). Кнопка — ОДИН элемент, который морфится: зелёный прямоугольник → (ширина сужается до круга, затем растут углы и
// высота) круг → обратно в обратном порядке (sayMorph.js, say-phrase-mic.css). ОДНА иконка микрофона едет из позиции слева от текста
// в центр круга и растёт (transform; сдвиг dx замерен здесь, CSS-переменная --say-icon-dx), текст «Нажмите, чтобы говорить» плавно
// гаснет. Вокруг круга — три полупрозрачных кольца-волны, которые следуют за голосом (useSayRings: уровень пишется в CSS-переменные
// --say-lvl* без ререндеров). Внутри панели нет подсказок: только подпись кнопки, «Слушаю…» в круге и системные «Микрофон выключен» /
// «Проверка голоса недоступна». Режимы (mode из micLabel в sayMic.js):
//  idle прямоугольник | prep круг, кольца спокойно «дышат», пока морфинг не кончился или движок не начал слушать |
//  listening круг «Слушаю…», кольца следуют за голосом | ok «Верно!» | off «Микрофон выключен» (перечёркнутая иконка).
// Нажатие в режиме listening = «стоп» (принять сказанное). data-no-unlock: тап по микрофону не запускает разблокировку звука
// (sounds.js/primedAudio.js) — она ставила бы аудиосессию в игру ровно в момент старта записи.
export default function SayStage({ label, mode, voice, disabled, onTap }) {
  const off = mode === 'off'
  const circle = mode === 'prep' || mode === 'listening'
  const Icon = off ? MicOff : mode === 'ok' ? Check : Mic
  const boxRef = useRef(null)
  const textRef = useRef(null)
  // Подпись прямоугольника держим прежней, пока кнопка — круг: иначе текст «схлопнется» и иконка прыгнет, а не поедет
  const [rectLabel, setRectLabel] = useState(label)
  if (!circle && rectLabel !== label) setRectLabel(label)
  // Круг уже был — значит, при выходе из него играем обратный морфинг (на первом показе анимации нет)
  const [wasCircle, setWasCircle] = useState(false)
  if (circle && !wasCircle) setWasCircle(true)
  const morph = circle ? ' sayMicBtn--in' : wasCircle ? ' sayMicBtn--out' : ''

  // Сдвиг иконки к центру кнопки = половина (текст + зазор): в прямоугольнике «иконка + текст» стоят по центру группой
  useLayoutEffect(() => {
    if (circle) return undefined
    const measure = () => {
      const w = textRef.current?.offsetWidth ?? 0
      boxRef.current?.style.setProperty('--say-icon-dx', `${(w + ICON_GAP) / 2}px`)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [circle, rectLabel])

  useSayRings(boxRef, { on: circle, listening: mode === 'listening', voice })

  return (
    <div ref={boxRef} className={`sayMicBox sayMicBox--${mode}`}>
      <span className="sayRings" aria-hidden="true" data-testid="say-rings">
        <i className="sayRing sayRing1" /><i className="sayRing sayRing2" /><i className="sayRing sayRing3" />
      </span>
      <button
        type="button"
        className={`phraseCheckBtn sayMicBtn sayMicBtn--${mode}${morph}`}
        onClick={onTap}
        disabled={disabled || off}
        aria-label={mode === 'listening' ? 'Остановить запись' : circle ? LISTENING : rectLabel}
        data-no-unlock=""
        data-testid="say-mic"
        data-mode={mode}
      >
        <span className="sayMicRow">
          <Icon className="sayMicIcon" size={22} aria-hidden="true" data-testid="say-mic-icon" />
          <span ref={textRef} className="sayMicText" data-testid="say-mic-label">{circle ? rectLabel : label}</span>
        </span>
        <span className="sayMicCaption" aria-hidden="true">{LISTENING}</span>
      </button>
    </div>
  )
}
