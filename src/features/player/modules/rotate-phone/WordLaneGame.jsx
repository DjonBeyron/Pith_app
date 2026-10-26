import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import WordLaneLines from './WordLaneLines.jsx'
import WordLaneSlots from './WordLaneSlots.jsx'
import WordLaneMic from './WordLaneMic.jsx'
import WordLaneDebug from './WordLaneDebug.jsx'
import { isWordLaneDebug } from './wordLaneConfig.js'
import { useWordLaneFlow } from './useWordLaneFlow.js'
import { WORD_Y } from './wordLaneTimeline.js'

// Вертикальная игра «Повтори за диктором» (полный экран, портрет): слово падает сверху → три дорожки со слоями → линия опускается, слои заливаются под голос диктора →
// «Теперь твоя очередь» → микрофон, линия опускается снова и подчиняется голосу ученика → перевод слова. Сценарий и таймеры — useWordLaneFlow.js, раскладка — wordLaneTimeline.js.
// Оверлей — portal в body поверх всего (z-index 10000), закрывает весь экран, включая зону вырезов (safe-area учтена отступами сцены). Крестик — выйти в любой момент.
export default function WordLaneGame({ cfg, audioSrc, onFinished }) {
  const f = useWordLaneFlow({ word: cfg.word, lang: cfg.lang, fills: cfg.fills, audioSrc, onFinished })
  const { phase } = f
  const user = phase === 'speak' || phase === 'reveal'
  const showSlots = phase !== 'drop'
  const micIn = phase === 'speak'
  const filled = user ? f.hits : f.coach
  const debug = isWordLaneDebug()

  return createPortal(
    <div className="wl" data-phase={phase} data-testid="wl">
      <div className="wlStage">
        <WordLaneLines phase={phase} phaseAt={f.phaseAt} hits={f.hits} misses={f.misses} anchors={f.plan.anchors} />
        <WordLaneSlots word={cfg.word} tone={user ? 'user' : 'coach'} filled={filled} misses={f.misses} visible={showSlots} fillMs={f.plan.fillMs} />
        <div className="wlWord" style={{ top: `${WORD_Y}%` }} data-testid="wl-word">{cfg.word}</div>
        {phase === 'turn' && <div className="wlTurn" data-testid="wl-turn">Теперь твоя очередь</div>}
        {phase === 'reveal' && (
          <div className="wlReveal" data-testid="wl-reveal">
            <div className="wlRevealLabel">Перевод</div>
            <div className="wlRevealText">{cfg.translation || '—'}</div>
            <button type="button" className="wlNext" onClick={f.finish} data-testid="wl-next">Дальше</button>
          </div>
        )}
        {debug && <WordLaneDebug anchors={f.plan.anchors} />}
        <WordLaneMic mode={f.mic} levels={f.levels} onTap={f.tapMic} visible={micIn} />
        {phase === 'speak' && f.mic === 'manual' && <button type="button" className="wlSkip" onClick={f.skip} data-testid="wl-skip">Пропустить</button>}
      </div>
      <button type="button" className="wlClose" onClick={f.finish} aria-label="Закрыть" data-testid="wl-close"><X size={20} /></button>
    </div>,
    document.body,
  )
}
