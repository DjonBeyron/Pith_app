import { useState, useRef, useEffect, useCallback } from 'react'
import { createSilentClock } from '../../../shared/lib/silentClock.js'
import { createAudioClipPlayer } from '../../../shared/lib/audioClipPlayer.js'

// Часы редактора тренажёра: мастер-время — silentClock (композиция может
// быть длиннее озвучки, а в озвучке есть дыры), <audio> идёт следом по
// нарезке через audioClipPlayer.js — ровно так же, как в плеере на телефоне.
// currentTime в состоянии обновляется по rAF на игре и сразу — при перемотке.
export function useSpeechLaneClock({ timelineLen, audioClips }) {
  const [isPlaying,   setIsPlaying]   = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const clockRef   = useRef(null)
  const audioRef   = useRef(null)
  const clipsRef   = useRef(audioClips)
  useEffect(() => { clipsRef.current = audioClips }, [audioClips])
  // Один проигрыватель на всё время жизни редактора; refs он читает лениво.
  // Заводится в эффекте, а не в рендере — правило react-hooks/refs
  const playerRef = useRef(null)
  useEffect(() => {
    playerRef.current = createAudioClipPlayer({ audioRef, clipsRef })
    return () => playerRef.current?.pause()
  }, [])

  // Часы пересоздаём только при смене длины — с сохранением позиции
  useEffect(() => {
    const prev = clockRef.current
    const t = prev?.currentTime ?? 0
    prev?.stop?.()
    const clock = createSilentClock(Math.max(1, timelineLen), {
      onEnded: () => { playerRef.current?.pause(); setIsPlaying(false); setCurrentTime(0) },
    })
    clock.currentTime = Math.min(t, timelineLen)
    clockRef.current = clock
    return () => clock.stop()
  }, [timelineLen])

  useEffect(() => {
    if (!isPlaying) { playerRef.current?.pause(); return }
    let rafId
    const tick = () => {
      const t = clockRef.current?.currentTime ?? 0
      setCurrentTime(t)
      playerRef.current?.tick(t, true)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isPlaying])

  const togglePlay = useCallback(() => {
    const c = clockRef.current
    if (!c) return
    if (c.paused) { c.play(); setIsPlaying(true) } else { c.pause(); setIsPlaying(false) }
  }, [])

  const handleSeek = useCallback(t => {
    const c = clockRef.current
    if (c) c.currentTime = t
    playerRef.current?.reset()
    setCurrentTime(t)
  }, [])

  // Пробел = play/pause, пока окно открыто (не из полей ввода)
  useEffect(() => {
    const onKey = e => {
      if (e.code !== 'Space') return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      e.preventDefault()
      togglePlay()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay])

  return { isPlaying, currentTime, audioRef, togglePlay, handleSeek }
}
