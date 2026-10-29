import { useCallback } from 'react'
import { flushSync } from 'react-dom'
import { stopVoice } from './wordLaneVoice.js'
import { releaseNotes } from './wordLaneNotes.js'
import { releaseClips } from './wordLaneClips.js'
import { endGameAudio } from './useGameAudioModes.js'
import { closeGameMic } from '../../../../shared/lib/gameMic.js'
import { gameMicGesture } from '../../../../shared/lib/gameMicGesture.js'
import { pLog } from '../../../../shared/lib/debug.js'

// Управление ходом игры «Повтори за диктором» из интерфейса (вынесено из useWordLaneFlow.js): «Ещё раз» после отказа слушателя, перезапуск ступени (HUD и «Продолжить» после паузы) и ПАУЗА.
// Пауза (сворачивание приложения, useWordLanePause) — сразу и целиком: стадия 'paused' (эффекты стадий и слушателя снимаются сами, сцена пилюль становится idle — пул возвращается в исходное),
// а всё, что звучит, тикает и слушает, останавливается здесь же, синхронно: таймеры, голос/клипы/ноты, слушатель Vosk, реплика кота, окна речи и сессия аудио, микрофон. Микрофон после паузы автоматически
// не открывается никогда (gameMicGesture): только из тапа «Продолжить». Во вступлении (drop / lanes) пауза тоже ставится — слушатель следующей ступени иначе открыл бы микрофон сам, — а «Продолжить» запускает
// вступление заново; на финале (reveal) пауза не нужна: микрофон закрывает «Дальше».
export function useWordLaneControls({ stages, sRef, setS, setMicEpoch, clearTimers, listenerRef, noteTimerRef, hintTimerRef, finishedRef, catApi, cat, dbg }) {
  const retryMic = useCallback(() => { setS(p => ({ ...p, mic: 'starting' })); setMicEpoch(e => e + 1) }, [setS, setMicEpoch]) // «Ещё раз» после отказа слушателя: новый слушатель

  /** HUD «Перезапустить ступень» и «Продолжить» после паузы: к началу текущей ступени (диктор → очередь ученика), слушатель и счёт с нуля; из паузы во вступлении — вступление заново; на финале — ничего */
  const restartStage = useCallback(() => {
    const cur = sRef.current
    const live = cur.stage === 'paused' ? cur.from : cur.stage
    const fresh = { hint: [], seq: [], misses: 0, lid: '', note: '' }
    if (cur.stage === 'paused' && live !== 'run') { // свернули во вступлении: роняем слово и открываем дорожки сначала
      clearTimers(); stopVoice(); dbg.event('restart-stage', { idx: 0, to: 0, from: live })
      setS(p => ({ ...p, ...fresh, stage: 'drop', idx: 0, at: performance.now() })); setMicEpoch(e => e + 1)
      return
    }
    const st = live === 'run' ? stages[cur.idx] : null
    if (!st) return
    const first = Math.max(0, st.step ? stages.findIndex(x => x.step === st.step) : st.idx)
    clearTimers(); stopVoice(); dbg.event('restart-stage', { idx: st.idx, to: first })
    setS(p => ({ ...p, ...fresh, stage: 'run', idx: first, at: performance.now() })); setMicEpoch(e => e + 1)
  }, [stages, sRef, setS, setMicEpoch, clearTimers, dbg])

  /**
   * Пауза: вызывать на visibilitychange → hidden и pagehide. Повторный вызов на паузе только ещё раз закрывает микрофон и звук (свернули снова, пока «Продолжить» открывал микрофон).
   * Возвращает true, если игра на паузе; false — финал или игра уже закончена (пауза не нужна)
   */
  const pause = (why = 'hidden') => { // не useCallback: catApi читается в момент вызова (кот мог не смонтироваться); подписчик (useWordLanePause) берёт свежую версию из ref
    const cur = sRef.current
    if (finishedRef.current || cur.stage === 'reveal') return false
    const already = cur.stage === 'paused'
    stopVoice(); releaseNotes(); releaseClips(); clearTimers()
    clearTimeout(noteTimerRef.current); clearTimeout(hintTimerRef.current)
    listenerRef.current?.dispose(); listenerRef.current = null
    cat.stop(); catApi?.current?.freeze?.()
    endGameAudio(); closeGameMic(); gameMicGesture.require() // окна речи закрыты, тип сессии возвращён, микрофон закрыт; открыть его теперь может только тап
    if (already) return true
    dbg.event('pause', { why, stage: cur.stage, idx: cur.idx }); pLog(`[pause] игра на паузе (${why}): ступень ${cur.stage}/${cur.idx}, микрофон закрыт — откроется только по тапу «Продолжить»`)
    flushSync(() => setS(p => ({ ...p, stage: 'paused', from: p.stage, hint: [], note: '' }))) // сразу: эффекты стадий и слушатель снимаются до того, как сработает отложенный таймер
    return true
  }

  return { retryMic, restartStage, pause }
}
