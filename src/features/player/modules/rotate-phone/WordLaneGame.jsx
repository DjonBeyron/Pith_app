import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import WordLanePills from './WordLanePills.jsx'
import WordLaneMic from './WordLaneMic.jsx'
import WordLaneDebug from './WordLaneDebug.jsx'
import WordLanePerf from './WordLanePerf.jsx'
import WordLaneCat from './WordLaneCat.jsx'
import XpFloat from '../../XpFloat.jsx'
import { isWordLaneDebug } from './wordLaneConfig.js'
import { useWordLaneFlow } from './useWordLaneFlow.js'
import { WORD_Y } from './wordLaneTimeline.js'

// Вертикальная игра «Повтори за диктором» (полный экран, портрет). Фраза из кусков (до трёх) стоит над дорожками: кусок над своей дорожкой, дорожки слева направо читаются как предложение.
// Раунды: наращивание (диктор — ученик по ступеням «кусок ×3 → следующий ×3 → вместе ×3 …»), «Порядок» (тап по дорожкам), «Вслепую» (ни текста, ни перевода) → перевод. Одно слово (фраза из одного куска)
// стоит над дорожками крупно, пилюли — три повтора. Сценарий и таймеры — useWordLaneFlow.js, пилюли — useWordLanePills.js, раскладка — wordLaneTimeline.js.
// Оверлей — portal в body поверх всего (z-index 10000), закрывает весь экран, включая зону вырезов (safe-area учтена отступами сцены). Крестик — выйти в любой момент.
export default function WordLaneGame({ cfg, audioSrc, lines = null, onFinished }) {
  const catApi = useRef(null) // Пит (кот-маскот): рот по голосу и реакции лицом — через api, минуя React на кадрах
  const f = useWordLaneFlow({ chunks: cfg.chunks, translation: cfg.translation, lang: cfg.lang, clips: cfg.clips, audioSrc, audio: cfg.audio, catApi, lines, confusers: cfg.confusers, onFinished })
  const { phase } = f
  const single = cfg.chunks.length === 1 && phase !== 'discern' // у одного слова текст стоит крупно — кроме «Различи»: там слова на пилюлях, а верное над дорожками не выдаём
  const showSlots = phase !== 'drop'
  const intro = phase === 'drop' || phase === 'lanes'
  const heads = intro ? cfg.chunks.map(text => ({ text, on: true })) : f.labels
  const debug = isWordLaneDebug()

  return createPortal(
    <div className="wl" data-phase={phase} data-testid="wl">
      <div className="wlStage">
        <WordLaneCat apiRef={catApi} />
        <WordLanePills scene={f.scene} levels={f.levels} fx={f.fx} live={f.live} sceneApi={f.sceneApi} visible={showSlots} onLane={phase === 'order' || phase === 'discern' ? f.onLane : null} />
        <div className={`wlXp${f.xp > 0 || f.xpEvents.length ? ' wlXp--on' : ''}`} data-testid="wl-xp">{f.xp} XP</div>
        {single
          ? <div className="wlWord" style={{ top: `${WORD_Y}%` }} data-testid="wl-word">{cfg.chunks[0]}</div>
          : (
            <div className="wlHeads" style={{ top: `${WORD_Y}%` }} data-testid="wl-heads">
              {heads.map((h, i) => <span key={i} className={`wlHead${h.on ? ' wlHead--on' : ''}${h.text ? '' : ' wlHead--empty'}`} data-testid={`wl-head-${i}`}>{h.text}</span>)}
            </div>
          )}
        {f.catLine && <div className="wlSay" key={f.catLine} role="status" data-testid="wl-say">{f.catLine}</div>}
        {f.plate && <div className="wlTurn" key={f.idx} style={{ animationDuration: `${f.plateMs}ms` }} data-testid="wl-turn">{f.plate}</div>}
        {phase === 'reveal' && (
          <div className="wlReveal" data-testid="wl-reveal">
            <div className="wlRevealPhrase">{f.text}</div>
            <div className="wlRevealLabel">Перевод</div>
            <div className="wlRevealText">{cfg.translation || '—'}</div>
            <button type="button" className="wlNext" onClick={f.finish} data-testid="wl-next">Дальше</button>
          </div>
        )}
        {debug && <WordLaneDebug />}
        {debug && <WordLanePerf />}
        <WordLaneMic mode={f.mic} levels={f.levels} note={f.note} onTap={f.tapMic} visible={phase === 'student'} />
        {phase === 'student' && f.mic === 'manual' && <button type="button" className="wlSkip" onClick={f.skip} data-testid="wl-skip">Пропустить</button>}
      </div>
      <XpFloat events={f.xpEvents} onDismiss={f.dismissXp} viewport />
      <button type="button" className="wlClose" onClick={f.finish} aria-label="Закрыть" data-testid="wl-close"><X size={20} /></button>
    </div>,
    document.body,
  )
}
