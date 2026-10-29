import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { Check, Mic } from 'lucide-react'
import { useAudioSource } from '../audio/useAudioSource.js'
import PlayerBubble from '../../PlayerBubble.jsx'
import WordLaneGame from './WordLaneGame.jsx'
import { readWordLane } from './wordLaneConfig.js'
import { normalizeLines } from './wordLaneCatLines.js'
import { startGameAudio } from './wordLaneStart.js'
import { getCatLines } from '../../../../shared/api/catLinesApi.js'
import { pLog } from '../../../../shared/lib/debug.js'

// Пауза после конца игры перед переходом дальше: подпись «закончена» должна успеть прочитаться
const DONE_AFTER_MS = 700
const FINISHED_TEXT = 'Голосовая тренировка закончена'

// Нода «Переверни телефон» (тип rotate_phone) — вертикальная игра «Повтори за диктором» (фраза из кусков: наращивание, порядок, вслепую): карточка в чате (как ссылка на урок: полоса, значок, текст) и кнопка «Начать».
// Тап — жест, поэтому прямо в нём (синхронно, до любых await) просим полный экран и открываем микрофон с типом аудиосессии, а звук диктора будим ПОСЛЕ этого, когда iOS улёгся (wordLaneStart.js; доступ к
// микрофону обычно уже дан на экране запуска урока — LaunchMicAsk); потом открываем игру (WordLaneGame, полный экран). Нет доступа к микрофону — игра идёт в ручном режиме. По концу игры карточка пишет, что тренировка закончена,
// и нода отпускает цепочку (onDone('shown')). Переворот экрана в горизонталь — позже, отдельным этапом.
export default function RotatePhoneModule({ node, file, onDone }) {
  // Настройки игры не должны меняться от перерисовок плеера: новый объект node.typeData на каждый рендер пересобирал бы рецепт посреди игры (сбрасывая ступень и звук) — ключ по содержимому
  const tdKey = JSON.stringify(node.typeData?.rotate_phone ?? null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cfg = useMemo(() => readWordLane(node.typeData?.rotate_phone), [tdKey])
  const { src: audioSrc } = useAudioSource(node, file) // озвучка ElevenLabs из ноды (file_id) — если автор её сгенерировал
  // История («Продолжить урок»): ноду ученик уже прошёл — игру заново не запускаем и цепочку не двигаем
  const [phase, setPhase] = useState(node.isHistory ? 'finished' : 'wait') // wait → game → finished
  const [busy, setBusy] = useState(false)
  const playedRef = useRef(false)
  const [lines, setLines] = useState(() => normalizeLines(null)) // реплики кота (общие настройки приложения): тексты по умолчанию, пока не догрузились
  useEffect(() => { if (!node.isHistory) getCatLines().then(raw => setLines(normalizeLines(raw))) }, [node.isHistory])

  const start = useCallback(async () => {
    if (busy || phase !== 'wait') return
    setBusy(true)
    try { document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch?.(() => {}) } catch { /* iPhone и часть браузеров не умеют — остаёмся в окне */ }
    // Тап — жест. ПОРЯДОК: сначала тип аудиосессии и микрофон (один поток на всю игру, без эхо/шумоподавления — иначе голос диктора хрипит; диалога нет, если доступ уже выдан), потом ждём, пока iOS уляжется
    // после смены сессии, и только потом будим звук диктора и кота — иначе прерывание сессии убивало разбуженные элементы и начало игры молчало (wordLaneStart.js)
    const { mic } = await startGameAudio({ cfg, audioSrc, lines })
    pLog(`[rotate] игра «${cfg.word}»: микрофон ${mic}${cfg.isDemo ? ', слово по умолчанию' : ''}`)
    playedRef.current = true
    setPhase('game')
    setBusy(false)
  }, [busy, phase, cfg, audioSrc, lines])

  const finished = useCallback(() => {
    try { if (document.fullscreenElement) document.exitFullscreen?.() } catch { /* уже вышли */ }
    setPhase('finished')
  }, [])

  useEffect(() => {
    if (phase !== 'finished' || !playedRef.current) return undefined
    const t = setTimeout(() => onDone?.('shown'), DONE_AFTER_MS)
    return () => clearTimeout(t)
  }, [phase, onDone])

  const done = phase === 'finished'
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
            <button type="button" className="playerRotateStart" onClick={start} disabled={busy || phase === 'game'} data-testid="rotate-start">
              {busy ? '…' : 'Начать'}
            </button>
          )}
        </div>
      </PlayerBubble>
      {phase === 'game' && <WordLaneGame cfg={cfg} audioSrc={cfg.hasAudio ? audioSrc : null} lines={lines} onFinished={finished} />}
    </div>
  )
}
