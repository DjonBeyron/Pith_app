import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { flushSync } from 'react-dom'
import { Check, Mic } from 'lucide-react'
import { useAudioSource } from '../audio/useAudioSource.js'
import PlayerBubble from '../../PlayerBubble.jsx'
import VoskReadyNotice from '../../../../shared/ui/VoskReadyNotice.jsx'
import { useVoskReady } from '../../../../shared/lib/vosk/useVoskReady.js'
import WordLaneGame from './WordLaneGame.jsx'
import { readWordLane } from './wordLaneConfig.js'
import { unlockVoice, prepareTrack, stopVoice } from './wordLaneVoice.js'
import { unlockNotes, releaseNotes } from './wordLaneNotes.js'
import { prepareClips, prepareWords, releaseClips } from './wordLaneClips.js'
import { playSpan, clipsFor } from './wordLaneAudio.js'
import { libItems } from './wordLaneLib.js'
import { normalizeLines, linesItems } from './wordLaneCatLines.js'
import { endGameAudio } from './useGameAudioModes.js'
import { getCatLines } from '../../../../shared/api/catLinesApi.js'
import { openGameMic, closeGameMic } from '../../../../shared/lib/gameMic.js'
import { gameAudioSession } from '../../../../shared/lib/gameMicSession.js'
import { primeAudio } from '../../../../shared/lib/primedAudio.js'
import { pLog } from '../../../../shared/lib/debug.js'

// Пауза после конца игры перед переходом дальше: подпись «закончена» должна успеть прочитаться
const DONE_AFTER_MS = 700
const WORDS_WAIT_MS = 2500 // сколько максимум ждём подготовку озвучки кусков перед началом игры
const FINISHED_TEXT = 'Голосовая тренировка закончена'
const MIC_PROBLEM = {
  denied: 'Нет доступа к микрофону. Разреши микрофон для сайта в настройках браузера и нажми «Начать» ещё раз.',
  unavailable: 'Микрофон недоступен на этом устройстве, поэтому игру не запустить.',
}

const leaveFullscreen = () => { try { if (document.fullscreenElement) document.exitFullscreen?.() } catch { /* уже вышли */ } }

// Нода «Переверни телефон» (тип rotate_phone) — вертикальная игра «Повтори за диктором» (фраза из кусков: наращивание, порядок, вслепую): карточка в чате (как ссылка на урок: полоса, значок, текст) и кнопка «Начать».
// Игра слушает ТОЛЬКО Vosk (ручного режима «тап = сказал» нет): пока модель не готова, вместо запуска — уведомление «Нужно скачать» (VoskReadyNotice / useVoskReady, как в «Скажи вслух»), игра не пускает.
// Тап — жест, поэтому прямо в нём (синхронно, до любых await) будим звук диктора и просим полный экран; потом открываем микрофон и, только если доступ дан, открываем игру (WordLaneGame, полный экран).
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
  const cfg = useMemo(() => readWordLane(node.typeData?.rotate_phone), [tdKey])
  const { src: audioSrc } = useAudioSource(node, file) // озвучка ElevenLabs из ноды (file_id) — если автор её сгенерировал
  const vosk = useVoskReady({ why: 'lesson' }) // распознавание только Vosk: модель в памяти или уведомление «Нужно скачать»
  const ready = vosk.status === 'ready'
  const [phase, setPhase] = useState('wait') // wait → game → finished (в тест-запуске после игры снова wait)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const [gameKey, setGameKey] = useState(0) // «Игра заново» из HUD: новый ключ — игра монтируется с нуля
  const playedRef = useRef(false)
  const [lines, setLines] = useState(() => normalizeLines(null)) // реплики кота (общие настройки приложения): тексты по умолчанию, пока не догрузились
  useEffect(() => { getCatLines().then(raw => setLines(normalizeLines(raw))) }, [])

  // Всё, что должно случиться в жесте (синхронно, до любых await): звук диктора, слоты озвучки кусков, ноты-награды, тип аудиосессии. Возвращает «озвучка кусков готова» (Promise)
  const armGame = useCallback(() => {
    unlockVoice()
    gameAudioSession.begin() // тип аудиосессии iOS на время игры (настройка в Админ → «Голос»): в самом тапе, до открытия микрофона; в конце игры вернёт useWordLaneFlow
    // Звуки диктора: куски фразы — отдельными файлами из библиотеки озвучки слов (слоты будятся тишиной в жесте), запись автора — только финал (вся фраза; у одного слова — если слова нет в библиотеке)
    const wordsReady = prepareWords([...libItems([...cfg.chunks, ...cfg.confusers.flat()]), ...linesItems(lines)]) // куски фразы, слова-запутыватели («Различи» — только озвучка) и озвученные реплики кота; заодно измеряется, где в файле звучит голос (без «хвоста»)
    if (cfg.hasAudio && audioSrc) {
      prepareTrack(audioSrc) // запасной путь: общий файл с перемоткой (элемент будится в жесте)
      const n = cfg.chunks.length
      const rows = n > 1 ? [clipsFor(cfg.clips, n, cfg.chunks.map((_, i) => i), 0)].filter(Boolean) : (cfg.clips ?? [])
      if (rows.length) prepareClips(audioSrc, rows.map(playSpan)) // файл режется на клипы-высказывания (iPhone не подгружает аудио заранее и плохо перематывает)
    }
    unlockNotes() // ноты-награды: элементы просыпаются в жесте, иначе iOS не даст им зазвучать по таймеру
    primeAudio()
    return wordsReady
  }, [cfg, audioSrc, lines])

  /** Не стартовали (микрофон не дали): отпустить всё, что подняли в жесте */
  const abortGame = useCallback(() => { stopVoice(); releaseNotes(); releaseClips(); endGameAudio(); closeGameMic(); leaveFullscreen() }, [])

  const start = useCallback(async () => {
    if (busy || phase !== 'wait' || !ready) return
    setBusy(true); setProblem('')
    const wordsReady = armGame()
    try { document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch?.(() => {}) } catch { /* iPhone и часть браузеров не умеют — остаёмся в окне */ }
    const [mic] = await Promise.all([
      openGameMic(), // на всех платформах: один поток на всю игру без эхо/шумоподавления (иначе голос диктора хрипит), диалога нет, если доступ уже выдан; распознаватель ступеней берёт его готовым
      Promise.race([wordsReady, new Promise(r => setTimeout(r, WORDS_WAIT_MS))]),   // длины слов нужны плану диктора, но долго ждать не будем
    ])
    pLog(`[rotate] игра «${cfg.word}»: микрофон ${mic}${cfg.isDemo ? ', слово по умолчанию' : ''}`)
    if (mic !== 'granted') { abortGame(); setProblem(MIC_PROBLEM[mic] ?? MIC_PROBLEM.unavailable); setBusy(false); return }
    playedRef.current = true
    setPhase('game')
    setBusy(false)
  }, [busy, phase, ready, cfg, armGame, abortGame])

  // «Игра заново» из HUD (тап — жест): старая игра размонтируется синхронно (закрывает микрофон, звуки и слоты), новая монтируется, и в том же тапе заново поднимаются звуки и микрофон
  const restart = useCallback(() => {
    flushSync(() => setGameKey(k => k + 1))
    armGame()
    openGameMic()
    pLog('[rotate] игра перезапущена из HUD')
  }, [armGame])

  const finished = useCallback(() => {
    leaveFullscreen()
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

  const game = phase === 'game' && <WordLaneGame key={gameKey} cfg={cfg} audioSrc={cfg.hasAudio ? audioSrc : null} lines={lines} forceDebug={forceDebug} onRestart={restart} onFinished={finished} />
  const extra = (
    <>
      {!ready && <VoskReadyNotice vosk={vosk} />}
      {problem && <p className="playerRotateProblem" role="alert" data-testid="rotate-problem">{problem}</p>}
    </>
  )
  if (bare) return <>{extra}{game}</>
  return (
    <>
      <RotateCard cfg={cfg} done={phase === 'finished'} busy={busy} locked={phase === 'game' || !ready} onStart={start}>{extra}</RotateCard>
      {game}
    </>
  )
}
