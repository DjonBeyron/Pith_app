import { useState, useRef, useEffect } from 'react'
import { analyzeWaveform, probeAudioDuration, drawWaveBar } from '../../../shared/lib/audioUtils.js'
import { createSilentClock } from '../../../shared/lib/silentClock.js'

// Аудио-источник таймлайна: выбор/замена/удаление файла, анализ волны,
// воспроизведение (реальным <audio> либо, без озвучки, часами —
// silentClock.js — тем же интерфейсом play/pause/currentTime), отрисовка
// волны в канвас, пробел = play/pause. Вынесено из TableTimelineEditor.jsx —
// там же остаются слои/клипы (useTableTimelineEdit) и геометрия плейхеда.
export function useTimelineAudioSource({ fileId, waveformData, duration, lessonFiles, onPickFile, timelineDur, setLocalLen }) {
  const [localFileId,   setLocalFileId]   = useState(fileId)
  const [localWave,     setLocalWave]     = useState(waveformData)
  const [localDuration, setLocalDuration] = useState(duration)
  const [localBlobUrl,  setLocalBlobUrl]  = useState(() => {
    const f = lessonFiles?.find(lf => lf.id === fileId)
    return f?.r2Url ?? null
  })
  const [analyzing, setAnalyzing]     = useState(false)
  const [isPlaying, setIsPlaying]     = useState(false)
  const [currentTime, setCurrentTime] = useState(0)

  const audioRef = useRef(null)
  const waveRef  = useRef(null)
  const ownedRef = useRef(null)
  // Монтаж без озвучки: время крутят часы (silentClock.js) — интерфейс тот же,
  // что у <audio>, поэтому весь код ниже про currentTime/play/pause не меняется
  const clockRef = useRef(null)
  const silent   = !localBlobUrl

  useEffect(() => {
    if (localBlobUrl || !fileId) return
    const f = lessonFiles?.find(lf => lf.id === fileId)
    if (!f?.localFile) return
    const url = URL.createObjectURL(f.localFile)
    if (ownedRef.current) URL.revokeObjectURL(ownedRef.current)
    ownedRef.current = url
    // Один раз на маунт синхронизируем локальный blob-URL с внешним File
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalBlobUrl(url)
  }, []) // eslint-disable-line

  // Волна на паузе: перерисовать при любой смене currentTime (клик/протяжка по
  // линейке-плейхеду) — раньше это было в одном эффекте с RAF-циклом ниже и не
  // зависело от currentTime, поэтому клик по линейке не красил волну зелёным,
  // пока не нажат play.
  useEffect(() => {
    if (!localDuration || isPlaying) return
    drawWaveBar(waveRef.current, localWave, currentTime / localDuration)
  }, [currentTime, isPlaying, localWave, localDuration])

  // RAF-цикл волны во время игры — отдельно, чтобы не перезапускаться на каждый currentTime
  useEffect(() => {
    if (!localDuration || !isPlaying) return
    let rafId
    const tick = () => {
      const t = (localBlobUrl ? audioRef.current : clockRef.current)?.currentTime ?? 0
      setCurrentTime(t)
      drawWaveBar(waveRef.current, localWave, localDuration ? t / localDuration : 0)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isPlaying, localWave, localDuration])

  // Источник времени: аудио, если оно есть, иначе часы
  function timeSource() {
    if (localBlobUrl) return audioRef.current
    if (!localDuration) return null
    if (!clockRef.current || clockRef.current.duration !== timelineDur) {
      clockRef.current?.stop?.()
      clockRef.current = createSilentClock(timelineDur, { onEnded: () => { setIsPlaying(false); setCurrentTime(0) } })
    }
    return clockRef.current
  }

  function togglePlay() {
    const a = timeSource()
    if (!a) return
    if (isPlaying) { a.pause(); setIsPlaying(false) } else { a.play()?.catch?.(() => {}); if (silent) setIsPlaying(true) }
  }

  // Пробел = play/pause (пока этот редактор открыт)
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Space') return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      e.preventDefault()
      togglePlay()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localBlobUrl, localDuration, isPlaying])

  useEffect(() => () => {
    if (ownedRef.current) URL.revokeObjectURL(ownedRef.current)
    clockRef.current?.stop?.()
  }, [])

  async function handleFileChange(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setAnalyzing(true)
    const id  = onPickFile(f)
    if (ownedRef.current) URL.revokeObjectURL(ownedRef.current)
    const url = URL.createObjectURL(f)
    ownedRef.current = url
    const [wave, dur] = await Promise.all([analyzeWaveform(url), probeAudioDuration(url)])
    setLocalFileId(id); setLocalWave(wave); setLocalDuration(dur); setLocalBlobUrl(url)
    // Композиция должна вмещать новую запись — растягиваем, если она короче
    setLocalLen(prev => (dur && prev < dur + 10 ? Math.round(dur + 10) : prev))
    setCurrentTime(0); setAnalyzing(false)
  }

  // Убрать озвучку: аудио уходит и из таймлайна, и из самой ноды (file_id
  // сохранится пустым при выходе). Монтаж при этом никуда не девается —
  // таймлайн продолжает жить по длине композиции
  function removeAudio() {
    if (!window.confirm('Убрать аудио из таблицы? Разметка таймлайна останется.')) return
    audioRef.current?.pause?.()
    if (ownedRef.current) { URL.revokeObjectURL(ownedRef.current); ownedRef.current = null }
    setLocalFileId(null)
    setLocalWave(null)
    setLocalDuration(null)
    setLocalBlobUrl(null)
    setIsPlaying(false)
    setCurrentTime(0)
  }

  // Клик/протяжка по линейке (как в Premiere) — ставит плейхед; play/пробел продолжат
  // именно отсюда, т.к. это просто currentTime самого <audio>.
  function handleSeek(t) {
    const a = timeSource()
    if (a) a.currentTime = t
    setCurrentTime(t)
  }

  const audioElProps = {
    onPlay:  () => setIsPlaying(true),
    onPause: () => setIsPlaying(false),
    onEnded: () => { setIsPlaying(false); setCurrentTime(0) },
  }

  return {
    localFileId, localWave, localDuration, localBlobUrl, analyzing, isPlaying, currentTime,
    audioRef, waveRef, audioElProps,
    handleFileChange, removeAudio, togglePlay, handleSeek,
  }
}
