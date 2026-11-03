import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import WordLaneCat from '../player/modules/rotate-phone/WordLaneCat.jsx'
import WordLanePause from '../player/modules/rotate-phone/WordLanePause.jsx'
import { useCatLines } from '../player/modules/rotate-phone/useCatLines.js'
import { useWordLanePause } from '../player/modules/rotate-phone/useWordLanePause.js'
import Game2Lane from './Game2Lane.jsx'
import Game2Summary from './Game2Summary.jsx'
import useGame2Flow from './useGame2Flow.js'
import { MODES } from './game2Modes.js'
import { phraseText } from './timelinePlan.js'
import { game2Cfg } from './game2Cfg.js'

// Экран «Мини-игры 2.0» (стенд, полный экран, портрет): тот же корень, что у игры «Повтори за диктором» (.wl / .wlStage: тёмный фон, крестик, Пит-кот), в центре — лента времени (Game2Lane), сверху — название режима.
// Крестик — выйти (onExit). Пауза при сворачивании — общая с игрой (useWordLanePause + WordLanePause): «Продолжить» открывает микрофон из тапа, режим идёт сначала. tapMode — «тап вместо речи» (pithy_wl_tap_v1):
// касание ленты засчитывает ближайшую пилюлю. Итог — плашка Game2Summary, когда Пит договорил последнюю реплику.
export default function Game2Stage({ plan, lines, phrase, tapMode = false, onExit }) {
  const catApi = useRef(null)
  const laneApi = useRef(null)
  const listenerRef = useRef(null) // слушатель текущего прохода: Пит говорит — его слова не засчитываются ошибкой (useCatLines.mute)
  const cat = useCatLines({ lines, rate: 1, catApi, listenerRef })
  const f = useGame2Flow({ plan, phrase, catApi, laneApi, cat, listenerRef })
  const pause = useWordLanePause({ f: f.adapter, cfg: game2Cfg(), audioSrc: null, lines })
  const mode = MODES[f.modeId] ?? MODES.start
  const input = f.modeId !== 'start' && mode.input !== 'none'

  return createPortal(
    <div className="wl g2" data-mode={f.modeId} data-testid="g2" data-estimated={f.estimated || undefined}>
      <div className="wlStage">
        <WordLaneCat apiRef={catApi} />
        <Game2Lane view={f.view} apiRef={laneApi} onPillTap={tapMode && input ? f.tap : null} />
        <div className="g2Mode" data-testid="g2-mode">{mode.title}</div>
        {f.estimated && <div className="g2Note" data-testid="g2-estimated">фраза не озвучена: тайминги на оценке</div>}
        {f.micNote && <div className="g2Note g2Note--bad" role="alert" data-testid="g2-mic-note">{f.micNote}</div>}
        {f.hint && <div className="g2Hint" role="status" data-testid="g2-hint">Начни с: <b>{f.hint}</b></div>}
        {tapMode && input && <div className="wlTapHint" data-testid="g2-tap-hint">Тап вместо речи: тапни пилюлю</div>}
        {f.modeId === 'done' && <Game2Summary text={phraseText(plan)} score={f.score} onAgain={f.again} onDone={onExit} />}
      </div>
      <button type="button" className="wlClose" onClick={onExit} aria-label="Закрыть" data-testid="g2-close"><X size={20} /></button>
      {f.paused && <WordLanePause pause={pause} onExit={onExit} />}
    </div>,
    document.body,
  )
}
