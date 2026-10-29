import { useEffect, useRef, useState } from 'react'
import { VOICE_THRESHOLD } from './wordLaneTimeline.js'
import { bindLevelVar } from './wordLaneMicLevel.js'
import { isWeakDevice } from '../../../../shared/lib/deviceTier.js'

// Микрофон игры: круглая кнопка внизу по центру и волны вокруг неё (как в «Сказать фразу»). Живой отклик — по голосу ученика (levels: подписка «уровень 0..1 каждый кадр», sayLevelSource):
// в DOM пишется ОДНА переменная --lvl (0…1) на .wlMicBox (wordLaneMicLevel.js: без React и без сглаживания, атака в один кадр, спад даёт сам источник уровня), а кнопка, свечение и кольца считают себя
// из неё в CSS (word-lane-mic.css). На слабом устройстве (wlMic--lite) дышит только кнопка. Нет распознавания (manual) — кольца просто дышат (CSS), а тап по кнопке засчитывает слово.
// mode: starting (включаю) | listening (слушаю) | manual (тап = слово сказано) | done. note — честное сообщение игры («Услышал: …»), на время показывается вместо подписи.
// Если за QUIET_MS после начала слушания голоса так и не было (громкость ниже порога) — подпись подсказывает говорить ближе: ученик должен знать, что дело в слышимости, а не в нём.
const CAPTION = { starting: 'Включаю микрофон…', listening: 'Слушаю…', manual: 'Нажми на микрофон', done: 'Есть!' }

const QUIET_MS = 6000
const QUIET_TEXT = 'Не слышу голос — говори ближе'

export default function WordLaneMic({ mode, levels, note = '', onTap, visible }) {
  const box = useRef(null)
  const [lite] = useState(isWeakDevice)
  const [quiet, setQuiet] = useState(false)
  useEffect(() => {
    const el = box.current
    if (!visible || mode !== 'listening' || !levels || !el) return undefined
    const timer = setTimeout(() => setQuiet(true), QUIET_MS)
    const off = bindLevelVar(el, levels, level => {
      if (level > VOICE_THRESHOLD) { clearTimeout(timer); setQuiet(false) }
    })
    return () => { clearTimeout(timer); off() }
  }, [mode, levels, visible])

  return (
    <div className={`wlMic wlMic--${mode}${visible ? ' wlMic--in' : ''}${lite ? ' wlMic--lite' : ''}`} data-testid="wl-mic">
      <div className={`wlMicCaption${note ? ' wlMicCaption--note' : ''}`}>{note || (quiet && mode === 'listening' ? QUIET_TEXT : CAPTION[mode]) || ''}</div>
      <div ref={box} className="wlMicBox">
        <div className="wlMicRings" aria-hidden="true"><i /><i /><i /></div>
        <button type="button" className="wlMicBtn" onClick={onTap} aria-label="Микрофон" data-no-unlock="" data-testid="wl-mic-btn">
          <svg width="38" height="38" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <rect x="17" y="4" width="14" height="24" rx="7" fill="currentColor" />
            <path d="M9.5 22.5v1.5a14.5 14.5 0 0 0 29 0v-1.5M24 38.5v5" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
