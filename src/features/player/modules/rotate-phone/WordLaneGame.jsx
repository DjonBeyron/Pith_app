import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import WordLanePills from './WordLanePills.jsx'
import WordLaneMic from './WordLaneMic.jsx'
import WordLaneDebug from './WordLaneDebug.jsx'
import WordLaneCat from './WordLaneCat.jsx'
import XpFloat from '../../XpFloat.jsx'
import { isWordLaneDebug } from './wordLaneConfig.js'
import { useWordLaneFlow } from './useWordLaneFlow.js'
import { WORD_Y } from './wordLaneTimeline.js'

// Вертикальная игра «Повтори за диктором» (полный экран, портрет): слово падает сверху → три дорожки → пилюли по очереди опускаются в центр, диктор озвучивает каждую (заливка синхронна с речью, щелчок, уходит вниз) →
// «Теперь твоя очередь» → микрофон, пилюли опускаются снова и наполняются голосом ученика → перевод слова. Сценарий и таймеры — useWordLaneFlow.js, раскладка — wordLaneTimeline.js.
// Оверлей — portal в body поверх всего (z-index 10000), закрывает весь экран, включая зону вырезов (safe-area учтена отступами сцены). Крестик — выйти в любой момент.
export default function WordLaneGame({ cfg, audioSrc, onFinished }) {
  const catApi = useRef(null) // Пит (кот-маскот): рот по голосу и реакции лицом — через api, минуя React на кадрах
  const f = useWordLaneFlow({ word: cfg.word, lang: cfg.lang, fills: cfg.fills, audioSrc, audio: cfg.audio, catApi, onFinished })
  const { phase } = f
  const showSlots = phase !== 'drop'
  const micIn = phase === 'speak'
  const debug = isWordLaneDebug()

  return createPortal(
    <div className="wl" data-phase={phase} data-testid="wl">
      <div className="wlStage">
        <WordLaneCat apiRef={catApi} />
        <WordLanePills phase={phase} phaseAt={f.phaseAt} plan={f.plan} hits={f.hits} misses={f.misses} levels={f.levels} fx={f.fx} visible={showSlots} />
        <div className={`wlXp${f.xp > 0 || f.xpEvents.length ? ' wlXp--on' : ''}`} data-testid="wl-xp">{f.xp} XP</div>
        <div className="wlWord" style={{ top: `${WORD_Y}%` }} data-testid="wl-word">{cfg.word}</div>
        {phase === 'turn' && <div className="wlTurn" data-testid="wl-turn">Теперь твоя очередь</div>}
        {phase === 'reveal' && (
          <div className="wlReveal" data-testid="wl-reveal">
            <div className="wlRevealLabel">Перевод</div>
            <div className="wlRevealText">{cfg.translation || '—'}</div>
            <button type="button" className="wlNext" onClick={f.finish} data-testid="wl-next">Дальше</button>
          </div>
        )}
        {debug && <WordLaneDebug plan={f.plan} />}
        <WordLaneMic mode={f.mic} levels={f.levels} note={f.note} onTap={f.tapMic} visible={micIn} />
        {phase === 'speak' && f.mic === 'manual' && <button type="button" className="wlSkip" onClick={f.skip} data-testid="wl-skip">Пропустить</button>}
      </div>
      <XpFloat events={f.xpEvents} onDismiss={f.dismissXp} viewport />
      <button type="button" className="wlClose" onClick={f.finish} aria-label="Закрыть" data-testid="wl-close"><X size={20} /></button>
    </div>,
    document.body,
  )
}
