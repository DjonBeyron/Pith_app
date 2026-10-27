import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { Check, Mic } from 'lucide-react'
import { useAudioSource } from '../audio/useAudioSource.js'
import PlayerBubble from '../../PlayerBubble.jsx'
import WordLaneGame from './WordLaneGame.jsx'
import { readWordLane } from './wordLaneConfig.js'
import { unlockVoice, prepareTrack } from './wordLaneVoice.js'
import { unlockNotes } from './wordLaneNotes.js'
import { prepareClips, prepareWords } from './wordLaneClips.js'
import { playSpan, clipsFor } from './wordLaneAudio.js'
import { libItems } from './wordLaneLib.js'
import { ensureMicAccess, micNeedsHold } from '../../../../shared/lib/micAccess.js'
import { openGameMic } from '../../../../shared/lib/gameMic.js'
import { primeAudio } from '../../../../shared/lib/primedAudio.js'
import { pLog } from '../../../../shared/lib/debug.js'

// Пауза после конца игры перед переходом дальше: подпись «закончена» должна успеть прочитаться
const DONE_AFTER_MS = 700
const FINISHED_TEXT = 'Голосовая тренировка закончена'

// Нода «Переверни телефон» (тип rotate_phone) — вертикальная игра «Повтори за диктором» (фраза из кусков: наращивание, порядок, вслепую): карточка в чате (как ссылка на урок: полоса, значок, текст) и кнопка «Начать».
// Тап — жест, поэтому прямо в нём (синхронно, до любых await) будим звук диктора и просим полный экран; потом проверяем микрофон (доступ обычно уже дан на экране запуска урока —
// LaunchMicAsk) и открываем игру (WordLaneGame, полный экран). Нет доступа к микрофону — игра идёт в ручном режиме. По концу игры карточка пишет, что тренировка закончена,
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

  const start = useCallback(async () => {
    if (busy || phase !== 'wait') return
    setBusy(true)
    unlockVoice()
    // Звуки диктора: куски фразы — отдельными файлами из библиотеки озвучки слов (слоты будятся тишиной в жесте), запись автора — только финал (вся фраза; у одного слова — если слова нет в библиотеке)
    prepareWords(libItems(cfg.chunks))
    if (cfg.hasAudio && audioSrc) {
      prepareTrack(audioSrc) // запасной путь: общий файл с перемоткой (элемент будится в жесте)
      const n = cfg.chunks.length
      const rows = n > 1 ? [clipsFor(cfg.clips, n, cfg.chunks.map((_, i) => i), 0)].filter(Boolean) : (cfg.clips ?? [])
      if (rows.length) prepareClips(audioSrc, rows.map(playSpan)) // файл режется на клипы-высказывания (iPhone не подгружает аудио заранее и плохо перематывает)
    }
    unlockNotes() // ноты-награды: элементы просыпаются в жесте, иначе iOS не даст им зазвучать по таймеру
    primeAudio()
    try { document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch?.(() => {}) } catch { /* iPhone и часть браузеров не умеют — остаёмся в окне */ }
    const mic = await (micNeedsHold() ? openGameMic() : ensureMicAccess()) // iPhone: один поток на всю игру (диалог один), у остальных доступ запоминается
    pLog(`[rotate] игра «${cfg.word}»: микрофон ${mic}${cfg.isDemo ? ', слово по умолчанию' : ''}`)
    playedRef.current = true
    setPhase('game')
    setBusy(false)
  }, [busy, phase, cfg, audioSrc])

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
      {phase === 'game' && <WordLaneGame cfg={cfg} audioSrc={cfg.hasAudio ? audioSrc : null} onFinished={finished} />}
    </div>
  )
}
