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
// а всё, что звучит, тикает и слушает, останавливается здесь же, синхронно: таймеры, голос/клипы/ноты, слушатель Vosk, реплика кота, окна речи и сессия аудио; дорожка микрофона выключается (поток жив — один
// на сеанс страницы, gameMic.closeGameMic). Включает её только тап «Продолжить» (gameMicGesture), без нового запроса, если дорожка пережила фон. Во вступлении (drop / lanes) пауза тоже ставится — слушатель следующей ступени иначе открыл бы микрофон сам, — а «Продолжить» запускает
// вступление заново; на финале (reveal) пауза не нужна: микрофон закрывает «Дальше».
/** С какого хода «Продолжить» из паузы cur: ступень ученика «Встряхни память» — ход паузы (cur.rep от сцены, resumeAt), иначе 0 (с начала ступени) */
const raceStep = (stages, cur) => { const st = cur?.stage === 'paused' && cur.from === 'run' ? stages?.[cur.idx] : null; return st?.race && st.type === 'student' ? st : null }
export const resumeRep = (stages, cur) => (raceStep(stages, cur) ? Math.max(0, cur.rep ?? 0) : 0)
/** Пауза в ступени ученика гонки: «Продолжить» вернёт к тому же слову / фразе (оверлей паузы так и пишет) */
export const resumesHere = (stages, cur) => !!raceStep(stages, cur)

export function useWordLaneControls({ stages, sRef, setS, setMicEpoch, clearTimers, listenerRef, noteTimerRef, hintTimerRef, finishedRef, catApi, cat, dbg, sceneApi = null }) {
  const retryMic = useCallback(() => { setS(p => ({ ...p, mic: 'starting' })); setMicEpoch(e => e + 1) }, [setS, setMicEpoch]) // «Ещё раз» после отказа слушателя: новый слушатель

  /** HUD «Перезапустить ступень» и «Продолжить» после паузы: к началу текущей ступени (диктор → очередь ученика), слушатель и счёт с нуля; из паузы во вступлении — вступление заново; на финале — ничего.
   *  «Встряхни память» (ступень ученика гонки): «Продолжить» — с хода, на котором была пауза (cur.rep — его отдала сцена в pause, resumeAt): он играется заново, уже сыгранные ходы — нет
   *  (s.resume = { at, n }: сцена берёт n, пока отметка времени стадии та же — любой другой переход стадии его сбрасывает сам). На плашке и в других играх — с начала ступени, как раньше */
  const restartStage = useCallback(() => {
    const cur = sRef.current
    const live = cur.stage === 'paused' ? cur.from : cur.stage
    const fresh = { hint: [], seq: [], misses: 0, lid: '', note: '', leaving: -1 }
    if (cur.stage === 'paused' && live !== 'run') { // свернули во вступлении: роняем слово и открываем дорожки сначала
      clearTimers(); stopVoice(); dbg.event('restart-stage', { idx: 0, to: 0, from: live })
      setS(p => ({ ...p, ...fresh, stage: 'drop', idx: 0, at: performance.now() })); setMicEpoch(e => e + 1)
      return
    }
    const st = live === 'run' ? stages[cur.idx] : null
    if (!st) return
    const n = resumeRep(stages, cur) // с текущего хода — только «Продолжить» в ступени ученика гонки
    const first = n > 0 ? st.idx : Math.max(0, st.step ? stages.findIndex(x => x.step === st.step) : st.idx)
    const total = (st.step ?? stages[st.idx + 1]?.step)?.reps?.length ?? '—'
    if (cur.stage === 'paused') pLog(`[pause] продолжить: ступень ${st.sid ?? st.idx}, ход ${n + 1} из ${total} (${n > 0 ? 'с текущего' : 'с начала'})`)
    clearTimers(); stopVoice(); dbg.event('restart-stage', { idx: st.idx, to: first, rep: n })
    const at = performance.now()
    setS(p => ({ ...p, ...fresh, stage: 'run', idx: first, at, resume: n > 0 ? { at, n } : null })); setMicEpoch(e => e + 1)
  }, [stages, sRef, setS, setMicEpoch, clearTimers, dbg])

  /**
   * Пауза: вызывать на visibilitychange → hidden и pagehide. Повторный вызов на паузе только ещё раз закрывает микрофон и звук (свернули снова, пока «Продолжить» открывал микрофон).
   * Возвращает true, если игра на паузе; false — финал или игра уже закончена (пауза не нужна)
   */
  const pause = (why = 'hidden') => { // не useCallback: catApi читается в момент вызова (кот мог не смонтироваться); подписчик (useWordLanePause) берёт свежую версию из ref
    const cur = sRef.current
    if (finishedRef.current || cur.stage === 'reveal') return false
    const already = cur.stage === 'paused'
    stopVoice(); releaseNotes(); releaseClips({ keepBuffers: true }); clearTimers() // пауза: декодированные звуки остаются — «Продолжить» не декодирует заново
    clearTimeout(noteTimerRef.current); clearTimeout(hintTimerRef.current)
    listenerRef.current?.dispose(); listenerRef.current = null
    cat.stop(); catApi?.current?.freeze?.()
    endGameAudio(); closeGameMic(); gameMicGesture.require() // окна речи закрыты, тип сессии возвращён, дорожка выключена (поток жив); включить её теперь может только тап
    if (already) return true
    dbg.event('pause', { why, stage: cur.stage, idx: cur.idx }); pLog(`[pause] игра на паузе (${why}): ступень ${cur.stage}/${cur.idx}, микрофон выключен (поток жив) — включится только по тапу «Продолжить»`)
    const rep = cur.stage === 'run' ? sceneApi?.current?.resumeAt?.() ?? 0 : 0 // с какого хода «Продолжить» (гонка: сцена пилюль ещё жива — до смены стадии)
    flushSync(() => setS(p => ({ ...p, stage: 'paused', from: p.stage, rep, hint: [], note: '' }))) // сразу: эффекты стадий и слушатель снимаются до того, как сработает отложенный таймер
    return true
  }

  return { retryMic, restartStage, pause }
}
