import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { flushSync } from 'react-dom'
import { Check, Mic } from 'lucide-react'
import { useAudioSource } from '../audio/useAudioSource.js'
import PlayerBubble from '../../PlayerBubble.jsx'
import VoskReadyNotice from '../../../../shared/ui/VoskReadyNotice.jsx'
import { useVoskReady } from '../../../../shared/lib/vosk/useVoskReady.js'
import WordLaneGame from './WordLaneGame.jsx'
import RotateTapHint from './RotateTapHint.jsx'
import { readWordLane } from './wordLaneConfig.js'
import { nextPlan } from '../../../rehearsal/rehearsalCfg.js'
import { stopVoice } from './wordLaneVoice.js'
import { releaseNotes } from './wordLaneNotes.js'
import { releaseClips } from './wordLaneClips.js'
import { normalizeLines } from './wordLaneCatLines.js'
import { startGameAudio } from './wordLaneStart.js'
import { warmGameSounds, warmSig } from './wordLaneWarm.js'
import { endGameAudio } from './useGameAudioModes.js'
import { getCatLines } from '../../../../shared/api/catLinesApi.js'
import { closeGameMic } from '../../../../shared/lib/gameMic.js'
import { gameAudioWarm } from '../../../../shared/lib/gameAudioWarm.js'
import { gameStartTrace } from '../../../../shared/lib/gameStartTrace.js'
import { pLog } from '../../../../shared/lib/debug.js'
import { whiskerModeLine } from '../../../scene/v2/whiskerWrite.js'

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
// Переворот экрана в горизонталь — позже, отдельным этапом.
// Тест-запуск из админки (GameTestBlock): bare — без карточки (только уведомление Vosk, сообщение и сама игра), startRef.current() — запуск из чужого тапа (жест сохраняется), игра по окончании не «закрывает» ноду,
// а возвращается в ожидание (кнопку можно нажать ещё раз); forceDebug включает журнал и HUD настроек, не требуя общего тумблера; onStatus({ phase, busy, ready, problem }) сообщает состояние наружу.
export default function RotatePhoneModule({ node, file, onDone, forceDebug = false, bare = false, startRef = null, onStatus = null }) {
  // История («Продолжить урок»): ноду ученик уже прошёл — игру заново не запускаем, Vosk не греем, цепочку не двигаем
  if (node.isHistory) return <RotateCard cfg={readWordLane(node.typeData?.rotate_phone)} done />
  return <RotateLive node={node} file={file} onDone={onDone} forceDebug={forceDebug} bare={bare} startRef={startRef} onStatus={onStatus} />
}

function RotateCard({ cfg, done = false, busy = false, locked = false, onStart = null, children = null }) {
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
            <button type="button" className="playerRotateStart" onClick={onStart} disabled={busy || locked} data-testid="rotate-start">
              {busy ? '…' : 'Начать'}
            </button>
          )}
        </div>
        {children}
      </PlayerBubble>
    </div>
  )
}

function RotateLive({ node, file, onDone, forceDebug, bare, startRef, onStatus }) {
  // Настройки игры не должны меняться от перерисовок плеера: новый объект node.typeData на каждый рендер пересобирал бы рецепт посреди игры (сбрасывая ступень и звук) — ключ по содержимому
  const tdKey = JSON.stringify(node.typeData?.rotate_phone ?? null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nodeCfg = useMemo(() => readWordLane(node.typeData?.rotate_phone), [tdKey])
  const [plan, setPlan] = useState(null) // «Ещё минутку?» в репетиции: следующий план вместо плана ноды
  const cfg = useMemo(() => (plan ? readWordLane({ plan }) : nodeCfg), [plan, nodeCfg])
  const { src: audioSrc } = useAudioSource(node, file) // озвучка ElevenLabs из ноды (file_id) — если автор её сгенерировал
  const vosk = useVoskReady({ why: 'lesson' }) // распознавание только Vosk: модель в памяти или уведомление «Нужно скачать»
  const ready = vosk.status === 'ready'
  const [phase, setPhase] = useState('wait') // wait → (tap: жест истёк, ждём касания) → game → finished (в тест-запуске после игры снова wait)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const [gameKey, setGameKey] = useState(0) // «Игра заново» из HUD: новый ключ — игра монтируется с нуля
  const playedRef = useRef(false)
  const [lines, setLines] = useState(() => normalizeLines(null)) // реплики кота (общие настройки приложения): тексты по умолчанию, пока не догрузились
  useEffect(() => { getCatLines().then(raw => setLines(normalizeLines(raw))) }, [])
  // Озвучку кусков и реплик Пита качаем и измеряем ЗАРАНЕЕ, пока карточка на экране (wordLaneWarm.js): к тапу «Начать» остаётся разбудить слоты. Пока качается — «Готовлю звук…» (кнопку не блокирует: тап ждёт озвучку сам)
  const sig = useMemo(() => warmSig(cfg, lines), [cfg, lines])
  const [warmed, setWarmed] = useState('')
  useEffect(() => {
    let alive = true
    warmGameSounds({ cfg, lines }).then(() => { if (alive) setWarmed(sig) })
    return () => { alive = false }
  }, [cfg, lines, sig])

  /** Не стартовали (микрофон не дали): отпустить всё, что подняли в жесте */
  const abortGame = useCallback(() => { stopVoice(); releaseNotes(); releaseClips(); endGameAudio(); closeGameMic(); leaveFullscreen() }, [])

  const start = useCallback(async () => {
    if (busy || phase !== 'wait' || !ready) return
    setBusy(true); setProblem('')
    try { document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch?.(() => {}) } catch { /* iPhone и часть браузеров не умеют — остаёмся в окне */ }
    // Тап — жест. ПОРЯДОК: сначала тип аудиосессии и микрофон (один поток на всю игру, без эхо/шумоподавления — иначе голос диктора хрипит; диалога нет, если доступ уже выдан), потом ждём, пока iOS уляжется
    // после смены сессии, и только потом будим звук диктора и кота — иначе прерывание сессии убивало разбуженные элементы и начало игры молчало (wordLaneStart.js)
    const { mic, needsTap } = await startGameAudio({ cfg, audioSrc, lines })
    pLog(`[rotate] игра «${cfg.word}»: микрофон ${mic}${cfg.isDemo ? ', слово по умолчанию' : ''}`)
    pLog(`[whiskers] ${whiskerModeLine()}`) // способ записи угла усов (HUD ⚙ «Усы»): по журналу видно, на каком режиме владелец смотрел анимацию
    if (mic !== 'granted') { abortGame(); setProblem(MIC_PROBLEM[mic] ?? MIC_PROBLEM.unavailable); setBusy(false); return }
    playedRef.current = true
    setPhase(needsTap ? 'tap' : 'game') // жест истёк до прогрева: звук разбужен вне жеста и молчит — сначала касание (RotateTapHint), потом игра, иначе первая реплика Пита тихая
    setBusy(false)
  }, [busy, phase, ready, cfg, audioSrc, lines, abortGame])

  /** Касание по «Тапни, чтобы начать» (свежий жест): прогрев звука, если его ещё не сделал слушатель касаний (gameAudioWarm), и открытие игры */
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
  useEffect(() => { onStatus?.({ phase, busy, ready, problem }) }, [onStatus, phase, busy, ready, problem])

  const game = phase === 'game' && <WordLaneGame key={gameKey} cfg={cfg} audioSrc={cfg.hasAudio ? audioSrc : null} lines={lines} forceDebug={forceDebug} onRestart={restart} onAgain={cfg.plan && !cfg.plan.only ? another : null} onFinished={finished} />
  const extra = (
    <>
      {phase === 'tap' && <RotateTapHint onTap={tapped} />}
      {!ready && <VoskReadyNotice vosk={vosk} />}
      {phase === 'wait' && warmed !== sig && <p className="playerRotateWarm" data-testid="rotate-warm">Готовлю звук…</p>}
      {problem && <p className="playerRotateProblem" role="alert" data-testid="rotate-problem">{problem}</p>}
    </>
  )
  if (bare) return <>{extra}{game}</>
  return (
    <>
      <RotateCard cfg={cfg} done={phase === 'finished'} busy={busy} locked={phase === 'game' || phase === 'tap' || !ready} onStart={start}>{extra}</RotateCard>
      {game}
    </>
  )
}
