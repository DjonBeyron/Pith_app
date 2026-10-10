import { useRef } from 'react'
import { Check } from 'lucide-react'
import SayCaption from './SayCaption.jsx'
import SayMicIcon from './SayMicIcon.jsx'
import SayRing from './SayRing.jsx'
import { useSayWaves } from './useSayWaves.js'
import { isLiveMode } from '../../../../shared/lib/speech/sayMic.js'
import { MIC_STOP_ARIA, MIC_ALLOW_ARIA, DONE } from '../../../../shared/lib/speech/sayTexts.js'

// Середина панели «Сказать фразу»: надпись над кругом (SayCaption) и КРУГЛАЯ кнопка-микрофон (.sayMicBox, ровно по центру высоты панели).
// Вид кнопки задаёт СОСТОЯНИЕ state (sayMicState.micVisualState) — класс .sayMicBox--{state} на корне, дальше всё чистым CSS (say-phrase-state.css):
//  locked нет доступа к микрофону (или вводный попап ещё не видели): серый круг ×0,85, перечёркнутая серая иконка, серая бегущая дуга, без пульса и волн; тап открывает попап |
//  ready доступ выдан: тёмный круг, зелёная иконка, СПЛОШНОЕ зелёное кольцо (без дуги, вращения и пульса), волн нет | active запись: круг ×1,15 пружиной, плавно (≈0,6 с) заливается салатовым,
//  иконка темнеет, три быстрые волны активации (.sayActWaves, одноразовый CSS), затем ЖИВОЙ эквалайзер (.sayEq; useSayWaves: rAF + transform прямо на DOM, радиус обрезан по контейнеру), зелёное кольцо остаётся (приглушено) |
//  done «Готово» с галочкой на салатовом круге | off микрофона не будет. Вокруг круга кольцо (SayRing): цвета — по состоянию, бегущая серая дуга только в locked.
// Все слои волн лежат в .sayWaveClip (overflow:hidden, размером с панель): даже при ошибке расчёта волны не выйдут за модуль. Режим mode (micLabel) остаётся для надписи и логики:
//  idle | retry | prep (тап был, движок ещё не слушает — эквалайзер уже живой) | listening (движок слушает, тап = стоп) | ok | off.
// data-no-unlock: тап по микрофону не запускает разблокировку звука (sounds.js/primedAudio.js) — она ставила бы аудиосессию в игру ровно в момент старта записи.
export default function SayStage({ label, mode, state, level, disabled, onTap }) {
  const live = isLiveMode(mode)
  const clipRef = useRef(null)
  const anchorRef = useRef(null)
  const eqRef = useRef(null)
  useSayWaves({ eqRef, clipRef, anchorRef }, { on: live, source: level })

  const aria = mode === 'ok' ? DONE : live ? MIC_STOP_ARIA : state === 'locked' ? MIC_ALLOW_ARIA : label // с доступом label — «Нажмите, чтобы говорить»
  return (
    <>
      <div ref={clipRef} className={`sayWaveClip${live ? ' sayWaveClip--live' : ''}`} aria-hidden="true" data-testid="say-waves">
        <span ref={anchorRef} className="sayWaveAnchor">
          <span className="sayActWaves" data-testid="say-act-waves"><i /><i /><i /></span>
          <span ref={eqRef} className="sayEq" data-testid="say-eq"><i /><i /><i /></span>
        </span>
      </div>
      <SayCaption label={label} />
      <div className={`sayMicBox sayMicBox--${state}`}>
        <SayRing />
        <button
          type="button"
          className={`phraseCheckBtn sayMicBtn sayMicBtn--${state}`}
          onClick={onTap}
          disabled={disabled || mode === 'off'}
          aria-label={aria}
          data-no-unlock=""
          data-testid="say-mic"
          data-mode={mode}
          data-state={state}
        >
          <span className="sayFace sayFaceMic">
            <SayMicIcon data-testid="say-mic-icon" />
          </span>
          <span className="sayFace sayFaceDone" aria-hidden="true" data-testid="say-done">
            <Check size={38} strokeWidth={3.2} />
            <span className="sayDoneText">{DONE}</span>
          </span>
        </button>
      </div>
    </>
  )
}
