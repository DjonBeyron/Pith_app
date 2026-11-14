import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import WordLanePills from './WordLanePills.jsx'
import WordLaneHeads from './WordLaneHeads.jsx'
import WordLaneMic from './WordLaneMic.jsx'
import WordLaneDebug from './WordLaneDebug.jsx'
import WordLaneDebugButton from './WordLaneDebugButton.jsx'
import WordLaneHud from './WordLaneHud.jsx'
import WordLanePerf from './WordLanePerf.jsx'
import WordLaneCat from './WordLaneCat.jsx'
import WordLaneXp from './WordLaneXp.jsx'
import WordLanePause from './WordLanePause.jsx'
import WordLaneCommentButton from './WordLaneCommentButton.jsx'
import WordLaneComment from './WordLaneComment.jsx'
import WordLaneTurnPlate from './WordLaneTurnPlate.jsx'
import RacePanel from '../../../pitrace/RacePanel.jsx'
import RaceMia from '../../../pitrace/RaceMia.jsx'
import { trioFor, trioCtx } from '../../../pitrace/raceTapTrio.js'
import { useWordLaneLeavingPlates } from './useWordLaneLeavingPlates.js'
import { chargeOn } from '../../../pitrace/raceCharge.js'
import { raceStart, PIT_PEEK_MS } from '../../../pitrace/raceStartTrace.js'
import { trackHead } from '../../../pitrace/raceDodgeDrive.js'
import { raceLinesOf } from '../../../pitrace/raceSilentLine.js'
import RehearsalActs from '../../../rehearsal/RehearsalActs.jsx'
import ReadKaraoke from '../../../rehearsal/read/ReadKaraoke.jsx'
import { isWeakDevice } from '../../../../shared/lib/deviceTier.js'
import { isWordLaneDebug } from './wordLaneConfig.js'
import { readPillSafe, readTapMode, readWeakStored } from './wordLaneHudSettings.js'
import { useWordLaneFlow } from './useWordLaneFlow.js'
import { useWordLanePause } from './useWordLanePause.js'
import { WORD_Y } from './wordLaneTimeline.js'
import { useConveyorArm } from './useConveyorArm.js'
import { conveyorSpeedHint } from './wordLaneConveyorSpeed.js'
import { laneTape } from './wordLaneTape.js'
import { useLabelFrames } from './useLaneLabels.js'

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

export default function WordLaneGame({ cfg, audioSrc, lines: rawLines = null, forceDebug = false, startHold = false, onRestart = null, onAgain = null, onSummary = null, onFinished }) { // startHold — «Гонка»: сцена открыта сразу после ответа на попап, звук ещё готовится (RotatePhoneModule): часы игры стоят, Пит уже наверху
  const rootRef = useRef(null)
  const [tapMode, setTapMode] = useState(readTapMode) // «тап вместо речи» (HUD, админ): тап по дорожке в очереди ученика засчитывает следующую цель — проверка механики и анимаций без голоса
  const [lite] = useState(() => readWeakStored() ?? isWeakDevice()) // слабое устройство: читка репетиции без курсора (ReadKaraoke)
  const [safe0] = useState(readPillSafe) // «безопасные слои пилюль» (HUD): класс только на старте, дальше его меняет сам HUD через classList — className не меняется, React его не трогает
  const [comment, setComment] = useState(null) // открыт оверлей комментария к этапу репетиции (шлифовка): { snap (что было на экране в момент тапа 💬), at }
  const catApi = useRef(null) // Пит (кот-маскот): рот по голосу и реакции лицом — через api, минуя React на кадрах
  const lines = useMemo(() => (cfg.plan?.game === 'race' ? raceLinesOf(rawLines) : rawLines), [cfg.plan, rawLines]) // «Встряхни память»: неозвученные реплики — короткая подпись вместо тишины (raceSilentLine.js)
  const f = useWordLaneFlow({ chunks: cfg.chunks, translation: cfg.translation, lang: cfg.lang, clips: cfg.clips, audioSrc, audio: cfg.audio, catApi, lines, confusers: cfg.confusers, plan: cfg.plan, forceDebug, hold: startHold, onFinished })
  useEffect(() => { if (cfg.plan?.game === 'race' && !tapMode) trackHead(rootRef.current?.querySelector('.wlCat')) }, [cfg.plan, tapMode]) // «Голосом»: Пит по центру с первой фразы, вертикаль ведёт один владелец (pitrace/raceHeadDepth.js); раньше выскакивания ниже
  useEffect(() => { if (startHold) { catApi.current?.peek?.(PIT_PEEK_MS); raceStart.pit() } }, []) // eslint-disable-line react-hooks/exhaustive-deps -- «Гонка»: Пит выскакивает при открытии сцены (≤ 300 мс, пружина головы) и ждёт первую реплику; раз за монтирование
  const pause = useWordLanePause({ f, cfg, audioSrc, lines }) // свернули приложение — пауза сразу, «Продолжить» открывает микрофон из тапа (useWordLanePause.js)
  const { phase } = f
  const plates = useWordLaneLeavingPlates(f.plate, f.idx, f.stageObj?.round?.look) // плашка остаётся в DOM на время ухода (улетает вверх, как пилюля): useWordLaneLeavingPlates.js
  const speed = conveyorSpeedHint(f.stages, f.stage === 'run' ? f.idx : -1) // «Гонка с Питом»: скорость первой пилюли ближайшей стадии — пунктир набирает её заранее (wordLaneConveyorSpeed.js)
  const armed = useConveyorArm(f) // какие дорожки взведены: конвейер зажигается за 0,66 с до конца реплики Пита / плашки (wordLaneConveyorStart.js), остановку решает привод по пилюлям на дорожке
  const single = cfg.chunks.length === 1 && phase !== 'discern' && !cfg.plan // у одного слова текст стоит крупно — кроме «Различи»: там слова на пилюлях, а верное над дорожками не выдаём
  const showSlots = phase !== 'drop'
  const intro = phase === 'drop' || phase === 'lanes' || f.pausedIntro
  const heads = intro && !cfg.plan ? cfg.chunks.map(text => ({ text, on: true })) : intro ? f.labels.map(() => ({ text: '', on: false })) : f.labels // заставка репетиции: слов сверху нет (v3.3.84)
  const fresh = useLabelFrames(heads, lite) // рамка вокруг новой подписи (WordLaneHeads)
  const karaoke = f.rh.on && f.stage === 'run' && ['read', 'descent'].includes(f.stageObj?.act) && !intro // акт «Читка»: слова заливаются зелёным под голос Пита / игрока (rehearsal/read/)
  const debug = isWordLaneDebug()
  const race = cfg.plan?.game === 'race' // гонка: подсказки «Тап вместо речи» над дорожкой нет (тап выбирается плашкой «Говорю / Тапаю» до старта), фон с узором, верхняя панель вместо крестика
  const trio = useMemo(() => (race && trioFor({ tap: tapMode, stage: f.stageObj }) ? trioCtx(cfg.plan, f.stageObj) : null), [race, tapMode, f.stageObj, cfg.plan]) // «Тапаю»: «Разгон» и «Слушай и лови» — три пилюли на слово (raceTapTrio.js); решается на старте ступени
  const dodge = race && !tapMode && !f.stageObj?.step?.tapOnly && !['climb', 'descent'].includes(f.stageObj?.act) // «Говорю»: Пит под пилюлей и уворачивается (pitrace/raceDodge.js); тап, вершина и спуск — без уворота
  const laneTap = useCallback((lane, pt) => { const api = f.sceneApi.current; if (api?.trio && !api.trio(lane, pt)) return; f.onLane(lane, pt) }, [f.sceneApi, f.onLane]) // eslint-disable-line react-hooks/exhaustive-deps -- тройка: тап по чужой пилюле — ошибка (дрожь), по верной дорожке — слово засчитывается как обычно

  return createPortal(
    <div ref={rootRef} className={safe0 ? 'wl wl--safe' : 'wl'} data-phase={phase} data-act={f.rh.on ? f.stageObj?.act : undefined} data-sid={f.rh.on ? f.stageObj?.sid : undefined} data-streak={f.rh.race?.streakMode} data-charge={cfg.plan?.game === 'race' && chargeOn(f) ? '' : undefined} data-race={race ? '' : undefined} data-mia={f.rh.mia?.mia?.phase === 'in' && f.rh.mia.mia.fast ? 'in' : undefined} data-tape={laneTape(f) ? '' : undefined} data-testid="wl">
      <div className="wlStage" data-tex={race && !lite ? '' : undefined}>
        <WordLaneCat apiRef={catApi} />
        <WordLanePills scene={f.scene} levels={f.levels} fx={f.fx} live={f.live} sceneApi={f.sceneApi} visible={showSlots} armed={armed} speed={speed} paused={f.paused} speedKey={f.stage === 'run' ? f.idx : -1} trio={trio} dodge={dodge} onLane={phase === 'order' || (phase === 'discern' && !f.stageObj?.speak) || ((tapMode || f.stageObj?.step?.tapOnly) && (phase === 'student' || f.stageObj?.speak)) ? laneTap : null} />
        <WordLaneXp apiRef={f.xpApi} />
        {race && f.rh.mia && <RaceMia mia={f.rh.mia.mia} caption={f.rh.miaCap} talk={f.rh.miaTalk} paused={f.paused} />}
        {single
          ? <div className="wlWord" style={{ top: `${WORD_Y}%` }} data-testid="wl-word">{cfg.chunks[0]}</div>
          : (
            <div className="wlHeads" style={{ top: `${WORD_Y}%` }} data-testid="wl-heads" data-lite={lite || undefined}>
              {karaoke
                ? <ReadKaraoke heads={heads} stage={f.stageObj} at={f.at} chunks={cfg.chunks} live={f.live} ready={f.lid === f.stageObj?.step?.id} lite={lite} />
                : <WordLaneHeads heads={heads} fresh={fresh} />}
            </div>
          )}
        {/* Подписи реплик Пита (белое облачко с текстом) убраны в v3.3.84: кот только говорит; f.catLine остаётся в комментариях владельца (commentSnapshot) */}
        {tapMode && !race && phase === 'student' && <div className="wlTapHint" data-testid="wl-tap-hint">Тап вместо речи: тапни дорожку</div>}
        {plates.map(p => <WordLaneTurnPlate key={p.id} text={p.text} leaving={p.leaving} soft={race} look={p.look} />)}
        {phase === 'reveal' && (
          <div className="wlReveal" data-testid="wl-reveal">
            <div className="wlRevealPhrase">{f.text}</div>
            <div className="wlRevealLabel">Перевод</div>
            <div className="wlRevealText">{cfg.translation || '—'}</div>
            <button type="button" className="wlNext" onClick={f.finish} data-testid="wl-next">Дальше</button>
            {f.dbg.enabled && <WordLaneDebugButton dbg={f.dbg} />}
          </div>
        )}
        <RehearsalActs f={f} cfg={cfg} lines={lines} onAgain={onAgain} onSummary={onSummary} />
        {debug && <WordLaneDebug />}
        {debug && <WordLanePerf />}
        {cfg.plan?.game !== 'race' && <Mic mode={f.mic} levels={f.levels} note={f.note} visible={phase === 'student'} />} {/* гонка: индикатора уровня микрофона нет (CONCEPT_RACE.md) */}
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
      {race
        ? <RacePanel onBack={f.finish} onPause={() => f.pause('button')} onResume={pause.resume} paused={f.paused} />
        : <button type="button" className="wlClose" onClick={f.finish} aria-label="Закрыть" data-testid="wl-close"><X size={20} /></button>}
      {f.paused && !comment && <WordLanePause pause={pause} onExit={f.finish} />}
      {f.dbg.enabled && <Hud dbg={f.dbg} rootRef={rootRef} onRestartStage={f.restartStage} onRestartGame={onRestart} onExit={f.finish} setTapMode={setTapMode} />}
      {f.dbg.enabled && f.rh.on && !comment && <WordLaneCommentButton f={f} cfg={cfg} rootRef={rootRef} onOpen={setComment} />}
      {comment && <WordLaneComment f={f} pause={pause} comment={comment} rootRef={rootRef} setTapMode={setTapMode} onClose={() => setComment(null)} />}
    </div>,
    document.body,
  )
}
