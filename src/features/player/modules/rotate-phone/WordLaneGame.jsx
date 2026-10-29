import { memo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import WordLanePills from './WordLanePills.jsx'
import WordLaneMic from './WordLaneMic.jsx'
import WordLaneDebug from './WordLaneDebug.jsx'
import WordLaneDebugButton from './WordLaneDebugButton.jsx'
import WordLaneHud from './WordLaneHud.jsx'
import WordLanePerf from './WordLanePerf.jsx'
import WordLaneCat from './WordLaneCat.jsx'
import WordLaneXp from './WordLaneXp.jsx'
import WordLanePause from './WordLanePause.jsx'
import WordLaneTurnPlate from './WordLaneTurnPlate.jsx'
import RehearsalActs from '../../../rehearsal/RehearsalActs.jsx'
import { isWordLaneDebug } from './wordLaneConfig.js'
import { readPillSafe, readTapMode } from './wordLaneHudSettings.js'
import { useWordLaneFlow } from './useWordLaneFlow.js'
import { useWordLanePause } from './useWordLanePause.js'
import { WORD_Y } from './wordLaneTimeline.js'

// Вертикальная игра «Повтори за диктором» (полный экран, портрет). Фраза из кусков (до трёх) стоит над дорожками: кусок над своей дорожкой, дорожки слева направо читаются как предложение.
// Раунды: наращивание (диктор — ученик по ступеням «кусок ×3 → следующий ×3 → вместе ×3 …»), «Порядок» (тап по дорожкам), «Вслепую» (ни текста, ни перевода) → перевод. Одно слово (фраза из одного куска)
// стоит над дорожками крупно, пилюли — три повтора. Сценарий и таймеры — useWordLaneFlow.js, пилюли — useWordLanePills.js, раскладка — wordLaneTimeline.js.
// Оверлей — portal в body поверх всего (z-index 10000), закрывает весь экран, включая зону вырезов (safe-area учтена отступами сцены). Крестик — выйти в любой момент.
// Тяжёлое (пилюли, кот, микрофон, награды XP) мемоизировано и живёт на стабильных пропсах: шаг сценария (подпись кота, подсказка, плашка) перерисовывает только лёгкую часть — подписи и плашки.
const Mic = memo(WordLaneMic) // микрофон перерисовывается, только когда сменились его пропсы (режим, подсказка, видимость), а не на каждый шаг оверлея
const Hud = memo(WordLaneHud) // HUD настроек (только при отладочном интерфейсе) живёт на стабильных пропсах и своём состоянии; класс wl--safe он ставит прямо на корень, минуя React

const FAIL_TEXT = {
  title: 'Не получается слушать',
  sub: 'Распознавание речи не запустилось: нет модели или микрофон не открылся. Проверь доступ к микрофону и попробуй ещё раз.',
}

export default function WordLaneGame({ cfg, audioSrc, lines = null, forceDebug = false, onRestart = null, onAgain = null, onFinished }) {
  const rootRef = useRef(null)
  const [tapMode, setTapMode] = useState(readTapMode) // «тап вместо речи» (HUD, админ): тап по дорожке в очереди ученика засчитывает следующую цель — проверка механики и анимаций без голоса
  const [safe0] = useState(readPillSafe) // «безопасные слои пилюль» (HUD): класс только на старте, дальше его меняет сам HUD через classList — className не меняется, React его не трогает
  const catApi = useRef(null) // Пит (кот-маскот): рот по голосу и реакции лицом — через api, минуя React на кадрах
  const f = useWordLaneFlow({ chunks: cfg.chunks, translation: cfg.translation, lang: cfg.lang, clips: cfg.clips, audioSrc, audio: cfg.audio, catApi, lines, confusers: cfg.confusers, plan: cfg.plan, forceDebug, onFinished })
  const pause = useWordLanePause({ f, cfg, audioSrc, lines }) // свернули приложение — пауза сразу, «Продолжить» открывает микрофон из тапа (useWordLanePause.js)
  const { phase } = f
  const single = cfg.chunks.length === 1 && phase !== 'discern' && !cfg.plan // у одного слова текст стоит крупно — кроме «Различи»: там слова на пилюлях, а верное над дорожками не выдаём
  const showSlots = phase !== 'drop'
  const intro = phase === 'drop' || phase === 'lanes' || f.pausedIntro
  const heads = intro ? cfg.chunks.map(text => ({ text, on: true })) : f.labels
  const debug = isWordLaneDebug()

  return createPortal(
    <div ref={rootRef} className={safe0 ? 'wl wl--safe' : 'wl'} data-phase={phase} data-act={f.rh.on ? f.stageObj?.act : undefined} data-sid={f.rh.on ? f.stageObj?.sid : undefined} data-testid="wl">
      <div className="wlStage">
        <WordLaneCat apiRef={catApi} />
        <WordLanePills scene={f.scene} levels={f.levels} fx={f.fx} live={f.live} sceneApi={f.sceneApi} visible={showSlots} onLane={phase === 'order' || phase === 'discern' || (tapMode && phase === 'student') ? f.onLane : null} />
        <WordLaneXp apiRef={f.xpApi} />
        {single
          ? <div className="wlWord" style={{ top: `${WORD_Y}%` }} data-testid="wl-word">{cfg.chunks[0]}</div>
          : (
            <div className="wlHeads" style={{ top: `${WORD_Y}%` }} data-testid="wl-heads">
              {heads.map((h, i) => <span key={i} className={`wlHead${h.on ? ' wlHead--on' : ''}${h.text ? '' : ' wlHead--empty'}`} data-testid={`wl-head-${i}`}>{h.text}</span>)}
            </div>
          )}
        {f.catLine && <div className="wlSay" key={f.catLine} role="status" data-testid="wl-say">{f.catLine}</div>}
        {tapMode && phase === 'student' && <div className="wlTapHint" data-testid="wl-tap-hint">Тап вместо речи: тапни дорожку</div>}
        {f.plate && <WordLaneTurnPlate key={f.idx} text={f.plate} ms={f.plateMs} />}
        {phase === 'reveal' && (
          <div className="wlReveal" data-testid="wl-reveal">
            <div className="wlRevealPhrase">{f.text}</div>
            <div className="wlRevealLabel">Перевод</div>
            <div className="wlRevealText">{cfg.translation || '—'}</div>
            <button type="button" className="wlNext" onClick={f.finish} data-testid="wl-next">Дальше</button>
            {f.dbg.enabled && <WordLaneDebugButton dbg={f.dbg} />}
          </div>
        )}
        <RehearsalActs f={f} cfg={cfg} onAgain={onAgain} />
        {debug && <WordLaneDebug />}
        {debug && <WordLanePerf />}
        <Mic mode={f.mic} levels={f.levels} note={f.note} visible={phase === 'student'} />
        {f.paused && <WordLanePause pause={pause} onExit={f.finish} />}
        {f.mic === 'failed' && !f.paused && (
          <div className="wlFail" role="alert" data-testid="wl-fail">
            <p className="wlFailTitle">{FAIL_TEXT.title}</p>
            <p className="wlFailSub">{FAIL_TEXT.sub}</p>
            <div className="wlFailBtns">
              <button type="button" className="wlFailBtn wlFailBtn--main" onClick={f.retryMic} data-testid="wl-fail-retry">Ещё раз</button>
              <button type="button" className="wlFailBtn" onClick={f.finish} data-testid="wl-fail-exit">Выйти</button>
            </div>
          </div>
        )}
      </div>
      <button type="button" className="wlClose" onClick={f.finish} aria-label="Закрыть" data-testid="wl-close"><X size={20} /></button>
      {f.dbg.enabled && <Hud dbg={f.dbg} rootRef={rootRef} onRestartStage={f.restartStage} onRestartGame={onRestart} onExit={f.finish} setTapMode={setTapMode} />}
    </div>,
    document.body,
  )
}
