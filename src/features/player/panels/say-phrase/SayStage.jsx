import { useRef } from 'react'
import { Mic, MicOff, Check } from 'lucide-react'
import SayCaption from './SayCaption.jsx'
import { useSayWaves } from './useSayWaves.js'
import { isLiveMode, isCalmMode } from '../../../../shared/lib/speech/sayMic.js'
import { MIC_STOP_ARIA, DONE } from '../../../../shared/lib/speech/sayTexts.js'

// Середина панели «Сказать фразу»: надпись над кругом (SayCaption) и КРУГЛАЯ кнопка-микрофон (.sayMicBox, ровно по центру высоты панели).
// Круг ВСЕГДА круглый, без текста в обычном состоянии — только значок микрофона. В покое он слегка пульсирует, от него расходятся небольшие
// ИСКУССТВЕННЫЕ волны (чистый CSS, .sayIdleWaves). Тап → в тот же кадр пульс усиливается, а искусственные волны сменяются ЖИВЫМ эквалайзером
// (.sayEq; useSayWaves: rAF + transform прямо на DOM, уровень берёт у заменяемого источника level, радиус обрезан по контейнеру). Успех: значок
// плавно сменяется галочкой и «Готово» внутри круга. Неудача: никаких крестиков и красного — просто снова покой и «Попробуйте сказать ещё раз».
// Все слои волн лежат в .sayWaveClip (overflow:hidden, размером с панель): даже при ошибке расчёта волны не выйдут за модуль. Режимы (mode — micLabel):
//  idle покой | retry покой после неудачи | prep тап был, движок ещё не слушает (эквалайзер уже живой) | listening движок слушает, тап = стоп |
//  ok галочка и «Готово» | off «Микрофон выключен» (перечёркнутая иконка).
// data-no-unlock: тап по микрофону не запускает разблокировку звука (sounds.js/primedAudio.js) — она ставила бы аудиосессию в игру ровно в момент старта записи.
export default function SayStage({ label, mode, level, disabled, onTap }) {
  const live = isLiveMode(mode)
  const clipRef = useRef(null)
  const anchorRef = useRef(null)
  const eqRef = useRef(null)
  useSayWaves({ eqRef, clipRef, anchorRef }, { on: live, source: level })

  const aria = mode === 'ok' ? DONE : live ? MIC_STOP_ARIA : label
  return (
    <>
      <div ref={clipRef} className={`sayWaveClip sayWaveClip--${live ? 'live' : isCalmMode(mode) ? 'calm' : 'idle'}`} aria-hidden="true" data-testid="say-waves">
        <span ref={anchorRef} className="sayWaveAnchor">
          <span className="sayIdleWaves" data-testid="say-idle-waves"><i /><i /><i /></span>
          <span ref={eqRef} className="sayEq" data-testid="say-eq"><i /><i /><i /></span>
        </span>
      </div>
      <SayCaption label={label} />
      <div className={`sayMicBox sayMicBox--${mode}`}>
        <button
          type="button"
          className={`phraseCheckBtn sayMicBtn sayMicBtn--${mode}${live ? ' sayMicBtn--live' : ''}`}
          onClick={onTap}
          disabled={disabled || mode === 'off'}
          aria-label={aria}
          data-no-unlock=""
          data-testid="say-mic"
          data-mode={mode}
        >
          <span className="sayFace sayFaceMic">
            {mode === 'off' ? <MicOff size={42} aria-hidden="true" /> : <Mic size={42} aria-hidden="true" data-testid="say-mic-icon" />}
          </span>
          <span className="sayFace sayFaceDone" aria-hidden="true" data-testid="say-done">
            <Check size={44} strokeWidth={3.2} />
            <span className="sayDoneText">{DONE}</span>
          </span>
        </button>
      </div>
    </>
  )
}
