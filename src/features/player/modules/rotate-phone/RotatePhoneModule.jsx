import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { flushSync } from 'react-dom'
import { Check, Mic } from 'lucide-react'
import { useAudioSource } from '../audio/useAudioSource.js'
import PlayerBubble from '../../PlayerBubble.jsx'
import VoskReadyNotice from '../../../../shared/ui/VoskReadyNotice.jsx'
import { useVoskReady } from '../../../../shared/lib/vosk/useVoskReady.js'
import { setRuReady } from '../../../pitrace/raceRu.js'
import WordLaneGame from './WordLaneGame.jsx'
import RotateTapHint from './RotateTapHint.jsx'
import { readWordLane } from './wordLaneConfig.js'
import { nextPlan } from '../../../rehearsal/rehearsalCfg.js'
import { stopVoice } from './wordLaneVoice.js'
import { releaseNotes } from './wordLaneNotes.js'
import { releaseClips } from './wordLaneClips.js'
import { dropWarmed } from './wordLaneFetch.js'
import { normalizeLines } from './wordLaneCatLines.js'
import { installGameAudioLife } from '../../../../shared/lib/gameAudioLife.js'
import { getGameCtx } from '../../../../shared/lib/gameAudioCtx.js'
import { startGameAudio } from './wordLaneStart.js'
import { warmGameSounds, warmSig } from './wordLaneWarm.js'
import { useWarmProgress } from './useWarmProgress.js'
import WordLaneWarmBar from './WordLaneWarmBar.jsx'
import { endGameAudio } from './useGameAudioModes.js'
import { getCatLines } from '../../../../shared/api/catLinesApi.js'
import { closeGameMic } from '../../../../shared/lib/gameMic.js'
import { gameAudioWarm } from '../../../../shared/lib/gameAudioWarm.js'
import { gameStartTrace } from '../../../../shared/lib/gameStartTrace.js'
import { pLog } from '../../../../shared/lib/debug.js'
import { whiskerModeLine } from '../../../scene/v2/whiskerWrite.js'
import RaceAskPlate from '../../../pitrace/RaceAskPlate.jsx'
import useRaceAsk from '../../../pitrace/useRaceAsk.js'
import { raceStart } from '../../../pitrace/raceStartTrace.js'
import { openAsk, answerAsk } from '../../../pitrace/raceLaunch.js'

// Пауза после конца игры перед переходом дальше: подпись «закончена» должна успеть прочитаться
const DONE_AFTER_MS = 700
const FINISHED_TEXT = 'Голосовая тренировка закончена'
const MIC_PROBLEM = {
  denied: 'Нет доступа к микрофону. Разреши микрофон для сайта в настройках браузера и нажми «Начать» ещё раз.',
  unavailable: 'Микрофон недоступен на этом устройстве, поэтому игру не запустить.',
}

const leaveFullscreen = () => { try { if (document.fullscreenElement) document.exitFullscreen?.() } catch { /* уже вышли */ } }

// Нода «Переверни телефон» (тип rotate_phone) — вертикальная игра «Повтори за диктором» (фраза из кусков: наращивание, порядок, вслепую): карточка в чате (как ссылка на урок: полоса, значок, текст) и кнопка «Начать».
// Игра слушает ТОЛЬКО Vosk (ручного режима «тап = сказал» нет): пока модель не готова, вместо запуска — уведомление «Нужно скачать» (VoskReadyNotice / useVoskReady, как в «Скажи вслух»), игра не пускает.
// Тап — жест, поэтому прямо в нём (синхронно, до любых await) просим полный экран и открываем микрофон с типом аудиосессии, а звук диктора будим ПОСЛЕ этого, когда iOS улёгся (wordLaneStart.js);
// только если доступ к микрофону дан, открываем игру (WordLaneGame, полный экран).
// Микрофон не дали — честное сообщение под карточкой, звук и полный экран отпускаются, игра не открывается. По концу игры карточка пишет, что тренировка закончена, и нода отпускает цепочку (onDone('shown')).
// «Гонка с Питом» (plan.game === 'race'): тап «Начать» (и кнопки админ-блока) только открывает СЦЕНУ игры с попапом «Говорю / Тапаю» (phase 'ask', RaceAskPlate.jsx) — до ответа не стартует ничего: ни звук, ни микрофон, ни заставка, ни реплики.
// «Говорю» / «Тапаю» — жест: из этого обработчика (pick) синхронно идёт startGameAudio (микрофон, звук, ворота), а игра монтируется сразу (hold: часы игры стоят, пока готовится звук, но не дольше RACE_HOLD_MAX_MS): Пит выскакивает за ≤ 300 мс и
// ждёт реплику не дольше 1,5 с (raceStartTrace.js, журнал «[race] старт: Пит через N мс, реплика через M мс»). Микрофон не дали — сцена закрывается, как раньше; жест истёк — «Тапни, чтобы начать». Реплики и ноты греются заранее, пока открыта сцена с попапом.
// Переворот экрана в горизонталь — позже, отдельным этапом.
// Тест-запуск из админки (GameTestBlock): bare — без карточки (только уведомление Vosk, сообщение и сама игра), startRef.current() — запуск из чужого тапа (жест сохраняется), игра по окончании не «закрывает» ноду,
// а возвращается в ожидание (кнопку можно нажать ещё раз); forceDebug включает журнал и HUD настроек, не требуя общего тумблера; onStatus({ phase, busy, ready, problem, warm }) сообщает состояние наружу.
export default function RotatePhoneModule({ node, file, onDone, forceDebug = false, bare = false, startRef = null, onStatus = null, linesRev = 0, onTap = null, askAuto = null }) {
  // История («Продолжить урок»): ноду ученик уже прошёл — игру заново не запускаем, Vosk не греем, цепочку не двигаем
  if (node.isHistory) return <RotateCard cfg={readWordLane(node.typeData?.rotate_phone)} done />
  return <RotateLive node={node} file={file} onDone={onDone} forceDebug={forceDebug} bare={bare} startRef={startRef} onStatus={onStatus} linesRev={linesRev} onTap={onTap} askAuto={askAuto} />
}

function RotateCard({ cfg, done = false, busy = false, locked = false, onStart = null, label = null, children = null }) {
  return (
    <div className="playerMsgRow">
      <PlayerBubble className="playerMsgBubble playerMsgBubble--lessonRef">
        <div className={`playerRotateCard${done ? ' playerRotateCard--stopped' : ''}`}>
          <span className="playerLessonRefBar" />
          <span className="playerRotateIconWrap" aria-hidden="true">
            <Mic size={30} className="playerRotateMic" />
            {done && <span className="playerRotateCheck"><Check size={13} /></span>}
          </span>
          <span className="playerLessonRefBody">
            <span className="playerRotateTitle">{done ? FINISHED_TEXT : cfg.title}</span>
            <span className="playerRotateCaption">{done ? `${cfg.word} — ${cfg.translation || 'повторено'}` : cfg.chunks.length > 1 ? 'Повторяй за диктором: куски фразы, порядок, по памяти' : 'Послушай слово и повтори его вслух'}</span>
          </span>
          {!done && (
            <button type="button" className={`playerRotateStart${label ? ' playerRotateStart--warm' : ''}`} onClick={onStart} disabled={busy || locked} data-testid="rotate-start">
              {label ?? (busy ? '…' : 'Начать')}
            </button>
          )}
        </div>
        {children}
      </PlayerBubble>
    </div>
  )
}

function RotateLive({ node, file, onDone, forceDebug, bare, startRef, onStatus, linesRev, onTap, askAuto }) { // onTap — «Говорю / Тапаю» сообщает режим тапа блоку стенда; askAuto ('voice' | 'tap') — стенд отвечает на попап сам
  // Настройки игры не должны меняться от перерисовок плеера: новый объект node.typeData на каждый рендер пересобирал бы рецепт посреди игры (сбрасывая ступень и звук) — ключ по содержимому
  const tdKey = JSON.stringify(node.typeData?.rotate_phone ?? null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nodeCfg = useMemo(() => readWordLane(node.typeData?.rotate_phone), [tdKey])
  const [plan, setPlan] = useState(null) // «Ещё минутку?» в репетиции: следующий план вместо плана ноды
  const cfg = useMemo(() => (plan ? readWordLane({ plan }) : nodeCfg), [plan, nodeCfg])
  const { src: audioSrc } = useAudioSource(node, file) // озвучка ElevenLabs из ноды (file_id) — если автор её сгенерировал
  useEffect(() => { installGameAudioLife() }, []) // следим за фоном/блокировкой и между играми: возврат помечает звук «подозрительным», следующий старт идёт полным путём (gameAudioLife.js)
  const vosk = useVoskReady({ why: 'lesson' }) // распознавание только Vosk: модель в памяти или уведомление «Нужно скачать»
  const ready = vosk.status === 'ready'
  const [phase, setPhase] = useState('wait') // wait → (race: ask — сцена с попапом) → (tap: жест истёк, ждём касания) → game → finished (в тест-запуске после игры снова wait)
  const race = cfg.plan?.game === 'race'
  const voskRu = useVoskReady({ lang: 'ru', hold: false, on: race }) // «Встряхни память», проход B: русская модель скачана? (в память не грузим — это делает переключатель слуха игры); нет её — проход B на тапе
  useEffect(() => { setRuReady(race && voskRu.status === 'ready') }, [race, voskRu.status])
  const ask = useRaceAsk({ onTap })
  const [hold, setHold] = useState(false) // «Гонка»: сцена открыта, звук ещё готовится — часы игры стоят, Пит уже на экране
  const genRef = useRef(0) // номер запуска: ответ startGameAudio старого запуска (игру закрыли) ничего не меняет
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const [gameKey, setGameKey] = useState(0) // «Игра заново» из HUD: новый ключ — игра монтируется с нуля
  const playedRef = useRef(false)
  const [lines, setLines] = useState(() => normalizeLines(null)) // реплики кота (общие настройки приложения): тексты по умолчанию, пока не догрузились
  useEffect(() => { getCatLines().then(raw => setLines(normalizeLines(raw))) }, [linesRev]) // linesRev растёт после озвучки реплик в админке: перечитать, не пересоздавая модуль (иначе Vosk греется заново и кнопка запуска серая до 25 с)
  // Озвучку кусков и реплик Пита качаем и декодируем ЗАРАНЕЕ и ВСЮ сразу, пока карточка на экране (wordLaneWarm.js). Ворота (wordLaneGate.js): пока не готовы первые N файлов, кнопка «Готовлю звук… 7/15»; тап разрешён —
  // игра ждёт ворота в startGameAudio (не дольше 8 с с тапа). Остальные файлы докачиваются фоном.
  const sig = useMemo(() => warmSig(cfg, lines), [cfg, lines])
  const [listed, setListed] = useState('') // подпись набора, для которого библиотека слов уже спрошена (до этого слов в плане нет, и «0 из 0» выглядело бы готовым)
  // Прогрев — и после КАЖДОЙ игры (phase снова 'wait'), и для следующего плана «Ещё минутку?» (пока идёт итог): буферы держим до закрытия карточки (releaseClips keepWarm, dropWarmed)
  const warmed = useRef(new Set()) // адреса, которые прогрела эта карточка: при закрытии отпускаются только они
  const warm = useCallback((c, opts = {}) => warmGameSounds({ cfg: c, lines }, { onItems: items => items.forEach(i => warmed.current.add(i.url)), ...opts }), [lines])
  useEffect(() => { if (phase === 'wait' || phase === 'ask') warm(cfg, { onListed: () => setListed(sig) }) }, [cfg, sig, phase, warm]) // и пока открыта сцена с попапом: реплики первых секунд и ноты греются ЗАРАНЕЕ (fetch и decode жеста не требуют)
  useEffect(() => () => dropWarmed([...warmed.current]), [])
  useEffect(() => { if (phase === 'ask') getGameCtx() }, [phase]) // пока висит попап: AudioContext создаётся заранее (suspended, без звука и без жеста); в тапе остаётся только resume
  const prewarmNext = useCallback(() => { const next = nextPlan(cfg.plan); if (next) warm(readWordLane({ plan: next })) }, [cfg, warm])
  const wp = useWarmProgress(cfg, lines, listed === sig)

  /** Не стартовали (микрофон не дали): отпустить всё, что подняли в жесте */
  const abortGame = useCallback(() => { stopVoice(); releaseNotes(); releaseClips({ keepWarm: true }); endGameAudio(); closeGameMic(); leaveFullscreen() }, [])
  const fullscreen = () => { try { document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch?.(() => {}) } catch { /* iPhone и часть браузеров не умеют — остаёмся в окне */ } }

  const start = useCallback(async () => {
    if (busy || phase !== 'wait' || !ready) return
    setProblem('')
    if (race) { openAsk({ fullscreen, setPhase }); return } // гонка: только открыть сцену с попапом, звук и микрофон — после ответа (pick)
    setBusy(true)
    fullscreen()
    // Тап — жест. ПОРЯДОК: сначала тип аудиосессии и микрофон (один поток на всю игру, без эхо/шумоподавления — иначе голос диктора хрипит; диалога нет, если доступ уже выдан), потом ждём, пока iOS уляжется
    // после смены сессии, и только потом будим звук диктора и кота — иначе прерывание сессии убивало разбуженные элементы и начало игры молчало (wordLaneStart.js)
    const { mic, needsTap } = await startGameAudio({ cfg, audioSrc, lines })
    pLog(`[rotate] игра «${cfg.word}»: микрофон ${mic}${cfg.isDemo ? ', слово по умолчанию' : ''}`)
    pLog(`[whiskers] ${whiskerModeLine()}`) // способ записи угла усов (HUD ⚙ «Усы»): по журналу видно, на каком режиме владелец смотрел анимацию
    if (mic !== 'granted') { abortGame(); setProblem(MIC_PROBLEM[mic] ?? MIC_PROBLEM.unavailable); setBusy(false); return }
    playedRef.current = true
    setPhase(needsTap ? 'tap' : 'game') // жест истёк до прогрева: звук разбужен вне жеста и молчит — сначала касание (RotateTapHint), потом игра, иначе первая реплика Пита тихая
    setBusy(false)
  }, [busy, phase, ready, race, cfg, audioSrc, lines, abortGame])

  /** Касание по «Тапни, чтобы начать» (свежий жест): прогрев звука, если его ещё не сделал слушатель касаний (gameAudioWarm), и открытие игры */
  /** «Говорю» / «Тапаю» (тап по кнопке попапа — жест): выбор и режим тапа, startGameAudio СИНХРОННО (микрофон, звук, ворота), игра открывается сразу — Пит выскакивает, часы стоят, пока звук не готов (не дольше RACE_HOLD_MAX_MS) */
  const pick = useCallback(choice => {
    if (phase !== 'ask') return
    const gen = ++genRef.current
    answerAsk({
      choice, ask, trace: raceStart, setPhase, setHold, current: () => genRef.current === gen, startAudio: hooks => startGameAudio({ cfg, audioSrc, lines, ...hooks }),
      onAudio: ({ mic, needsTap }) => {
        pLog(`[rotate] игра «${cfg.word}»: микрофон ${mic}`)
        if (mic !== 'granted') { raceStart.cancel(); abortGame(); setProblem(MIC_PROBLEM[mic] ?? MIC_PROBLEM.unavailable); setHold(false); setPhase('wait'); return }
        playedRef.current = true; setHold(false)
        if (needsTap) setPhase('tap') // жест истёк до прогрева: сначала касание, потом игра
      },
    })
  }, [phase, ask, cfg, audioSrc, lines, abortGame])
  const cancelAsk = useCallback(() => { setPhase('wait'); leaveFullscreen() }, [])
  useEffect(() => { // стенд: ?ask=voice|tap — попап проходится сам
    if (phase !== 'ask' || !askAuto) return undefined
    const t = setTimeout(() => pick(askAuto), 0)
    return () => clearTimeout(t)
  }, [phase, askAuto, pick])
  const { watch: watchTap } = ask
  useEffect(() => { if (race) watchTap({ phase: phase === 'tap' ? 'game' : phase, problem }) }, [race, phase, problem, watchTap]) // игра кончилась или не запустилась — прежний режим тапа возвращается

  const tapped = useCallback(() => {
    if (gameAudioWarm.status().armed) gameAudioWarm.rewarm('тап по подсказке «Тапни, чтобы начать»', 'click')
    gameStartTrace.setNeedsTap(false); gameStartTrace.mark('hint-tap', { via: 'подсказка' })
    setPhase('game')
  }, [])

  // «Игра заново» из HUD (тап — жест): старая игра размонтируется синхронно (закрывает микрофон, звуки и слоты), новая монтируется, и в том же тапе заново открываются сессия и микрофон, звук будится после
  const restart = useCallback(() => {
    flushSync(() => setGameKey(k => k + 1))
    startGameAudio({ cfg, audioSrc, lines })
    pLog('[rotate] игра перезапущена из HUD')
  }, [cfg, audioSrc, lines])

  /** «Ещё минутку?» (тап — жест): новая репетиция по следующему плану — игра монтируется заново, звук и микрофон открываются в этом же тапе */
  const another = useCallback(() => {
    const next = nextPlan(cfg.plan)
    if (!next) return
    flushSync(() => { setPlan(next); setGameKey(k => k + 1) })
    startGameAudio({ cfg: readWordLane({ plan: next }), audioSrc, lines })
    pLog(`[rotate] ещё одна репетиция: ${next.phrase}`)
  }, [cfg, audioSrc, lines])

  const finished = useCallback(() => {
    genRef.current += 1; setHold(false); raceStart.cancel()
    leaveFullscreen(); setPlan(null) // следующая игра — снова по плану ноды
    if (bare) { setPhase('wait'); onDone?.('shown') } else setPhase('finished')
  }, [bare, onDone])

  useEffect(() => {
    if (bare || phase !== 'finished' || !playedRef.current) return undefined
    const t = setTimeout(() => onDone?.('shown'), DONE_AFTER_MS)
    return () => clearTimeout(t)
  }, [bare, phase, onDone])

  useEffect(() => {
    if (!startRef) return undefined
    startRef.current = start
    return () => { startRef.current = null }
  }, [startRef, start])
  useEffect(() => { onStatus?.({ phase, busy: busy || phase === 'ask', ready, problem, vosk: vosk.status, warm: wp.open ? '' : wp.label }) }, [onStatus, phase, busy, ready, problem, vosk.status, wp.open, wp.label])

  const game = phase === 'game' && <WordLaneGame key={gameKey} cfg={cfg} audioSrc={cfg.hasAudio ? audioSrc : null} lines={lines} forceDebug={forceDebug} startHold={hold} onRestart={restart} onAgain={cfg.plan && !cfg.plan.only && !cfg.plan.round ? another : null} onSummary={cfg.plan && !cfg.plan.only && !cfg.plan.round ? prewarmNext : null} onFinished={finished} />
  const extra = (
    <>
      {phase === 'ask' && <RaceAskPlate choice={ask.choice} onPick={pick} onCancel={cancelAsk} />}
      {phase === 'tap' && <RotateTapHint onTap={tapped} />}
      {!ready && <VoskReadyNotice vosk={vosk} />}
      {phase === 'wait' && !wp.all && <WordLaneWarmBar wp={wp} />}
      {problem && <p className="playerRotateProblem" role="alert" data-testid="rotate-problem">{problem}</p>}
    </>
  )
  if (bare) return <>{extra}{game}</>
  return (
    <>
      <RotateCard cfg={cfg} done={phase === 'finished'} busy={busy} locked={phase === 'game' || phase === 'tap' || !ready} label={phase === 'wait' && !wp.open ? wp.label : null} onStart={start}>{extra}</RotateCard>
      {game}
    </>
  )
}
