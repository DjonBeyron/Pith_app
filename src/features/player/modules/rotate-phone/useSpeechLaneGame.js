import { useState, useRef, useEffect } from 'react'
import { createSilentClock } from '../../../../shared/lib/silentClock.js'
import { createAudioClipPlayer } from '../../../../shared/lib/audioClipPlayer.js'
import { timelineToFileTime } from '../../../../shared/lib/audioClips.js'
import { WAVEFORM_FPS } from '../../../../shared/lib/audioUtils.js'
import { pLog } from '../../../../shared/lib/debug.js'

// Хвост после последнего вылета: слово должно улететь, а не оборваться
const TAIL_S = 0.6

// Прогон тренажёра в плеере: мастер-часы — silentClock по длине композиции
// (в озвучке есть дыры для ученика, поэтому не <audio>), звук идёт следом по
// нарезке (audioClipPlayer.js — ровно как в редакторе), rAF отдаёт время и
// громкость диктора (по волне файла — см. PROJECT.md, почему не Web Audio).
// Скрытая вкладка ставит часы на паузу: иначе слова улетели бы «за кадром».
export function useSpeechLaneGame({ active, audioClips, timelineLen, wave, onEnd }) {
  const [t, setT] = useState(0)
  const [level, setLevel] = useState(0)
  const audioRef = useRef(null)
  const clipsRef = useRef(audioClips)
  const onEndRef = useRef(onEnd)
  useEffect(() => { clipsRef.current = audioClips }, [audioClips])
  useEffect(() => { onEndRef.current = onEnd }, [onEnd])

  useEffect(() => {
    if (!active) return
    const player = createAudioClipPlayer({ audioRef, clipsRef })
    const clock = createSilentClock(timelineLen + TAIL_S, {
      onEnded: () => { player.pause(); pLog('[speech-lane] прогон окончен'); onEndRef.current?.() },
    })
    clock.play()
    pLog(`[speech-lane] старт: композиция ${timelineLen.toFixed(1)}с, кусков озвучки ${audioClips.length}`)

    let rafId
    const tick = () => {
      const now = clock.currentTime
      setT(now)
      player.tick(now, !clock.paused)
      const tf = timelineToFileTime(clipsRef.current, now)
      const amp = tf != null && wave?.length
        ? (wave[Math.min(wave.length - 1, Math.floor(tf * WAVEFORM_FPS))] ?? 0) / 255
        : 0
      setLevel(amp)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    const onVis = () => {
      if (document.hidden) { clock.pause(); player.pause() } else clock.play()
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      cancelAnimationFrame(rafId)
      document.removeEventListener('visibilitychange', onVis)
      clock.pause()
      clock.stop()
      player.pause()
    }
  }, [active, timelineLen]) // eslint-disable-line react-hooks/exhaustive-deps

  return { t, level, audioRef }
}
