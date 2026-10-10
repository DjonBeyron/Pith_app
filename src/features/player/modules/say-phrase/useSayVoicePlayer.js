import { useState, useEffect, useRef, useCallback } from 'react'
import { fmtAudioTime } from '../../../../shared/lib/audioUtils.js'
import { isMicBusy } from '../../../../shared/lib/soundQuiet.js'
import { pLog } from '../../../../shared/lib/debug.js'
import { stopWord } from '../../word-audio/wordAudioPlayer.js'

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Воспроизведение «своего голосового» в пузыре ученика (SayVoiceReply.jsx): обычный <audio> по blob-URL клипа из реестра сессии (sayVoiceStore.js) — тот же класс элемента, что у голосовых
// учителя (AudioModule), поэтому «звучит что-то одно» обеспечивает useSoloMedia плеера (слушаем capture-событие play на контейнере): запуск голосового глушит соседнее голосовое/видео и наоборот;
// озвучку слов (отдельные Audio вне DOM) глушим сами (stopWord). Не играем, пока идёт запись/окно тишины звуков приложения (isMicBusy): своя речь не должна попасть в микрофон.
// Ошибка воспроизведения тихая (pLog, кнопка возвращается в ▶). Волна: заливка по rAF; при prefers-reduced-motion заливки нет (только время). Возвращает { audioRef, playing, toggle }.
// waveRef — ручка AudioWave (setProgress/finish), timeRef — span с оставшимся временем (обновляем в обход React).
export function useSayVoicePlayer(durationMs, waveRef, timeRef) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef(null)
  const rafRef = useRef(0)
  const total = Math.max(0.1, durationMs / 1000)

  const stopRaf = useCallback(() => { if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0 } }, [])
  const paintTime = useCallback(left => { if (timeRef.current) timeRef.current.textContent = fmtAudioTime(left) }, [timeRef])

  useEffect(() => {
    const a = audioRef.current
    if (!a) return undefined
    const still = reducedMotion()
    const tick = () => {
      const ct = a.currentTime
      if (!still) waveRef.current?.setProgress(Math.min(1, ct / total))
      paintTime(Math.max(0, total - ct))
      rafRef.current = requestAnimationFrame(tick)
    }
    const onPlay = () => { setPlaying(true); stopRaf(); rafRef.current = requestAnimationFrame(tick) }
    const onPause = () => { stopRaf(); setPlaying(false) }
    const onEnded = () => { stopRaf(); setPlaying(false); if (!still) waveRef.current?.finish(); paintTime(total) }
    const onError = () => { stopRaf(); setPlaying(false); pLog(`[say-voice] ошибка воспроизведения: ${a.error?.code ?? '?'} ${a.error?.message ?? ''}`) }
    a.addEventListener('play', onPlay)
    a.addEventListener('pause', onPause)
    a.addEventListener('ended', onEnded)
    a.addEventListener('error', onError)
    return () => {
      a.removeEventListener('play', onPlay); a.removeEventListener('pause', onPause); a.removeEventListener('ended', onEnded); a.removeEventListener('error', onError)
      stopRaf()
      try { a.pause() } catch { /* элемент выгружен */ }
    }
  }, [total, waveRef, stopRaf, paintTime])

  const toggle = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    if (!a.paused) { a.pause(); return }
    if (isMicBusy()) return // идёт запись: чужой звук в этот момент не нужен
    stopWord()
    if (a.ended) a.currentTime = 0
    Promise.resolve(a.play()).catch(e => { setPlaying(false); pLog(`[say-voice] play() отклонён: ${e?.name} ${e?.message}`) })
  }, [])

  return { audioRef, playing, toggle }
}
