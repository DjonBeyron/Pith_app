import { useCallback, useEffect, useRef, useState } from 'react'
import { speakLine } from './sceneSpeech.js'

// «Режиссёр» сцены: проигрывает timeline по очереди, держит play/pause/restart,
// текущую реплику и говорящего. Озвучка — sceneSpeech.js (speechSynthesis или таймер).
// Пауза отменяет текущую реплику; продолжение начинает её с начала (speechSynthesis.pause()
// на iOS/Chrome ненадёжен — для прототипа проще перезапуск реплики).
// Смена сценария — через key у компонента-владельца (остановка/сброс без эффектов).
export function useSceneDirector(scene, { sound = true } = {}) {
  const [index, setIndex] = useState(0)
  const [status, setStatus] = useState('idle') // idle | playing | paused | ended
  const [run, setRun] = useState(0) // счётчик перезапусков — чтобы restart() перезапускал и реплику №0
  const [wordTick, setWordTick] = useState(0) // растёт на границе каждого слова (рот кота)
  const [mode, setMode] = useState('timer') // 'speech' | 'timer' — чем озвучивается текущая реплика
  const cancelRef = useRef(null)

  const timeline = scene?.timeline ?? []
  const line = timeline[index] ?? null
  const speaker = line ? scene.characters.find(c => c.id === line.who) ?? null : null
  const total = timeline.length

  useEffect(() => {
    if (status !== 'playing' || !line) return undefined
    const isLast = index >= total - 1
    const cancel = speakLine(line.text, speaker?.voice, {
      sound,
      onBoundary: () => setWordTick(t => t + 1),
      onMode: setMode,
      onEnd: () => {
        cancelRef.current = null
        if (isLast) setStatus('ended')
        else setIndex(i => i + 1)
      },
    })
    cancelRef.current = cancel
    return () => { cancelRef.current = null; cancel() }
  }, [status, index, run, sound, line, speaker, total])

  const play = useCallback(() => {
    setStatus(s => (s === 'ended' ? s : 'playing'))
  }, [])

  const pause = useCallback(() => {
    setStatus(s => (s === 'playing' ? 'paused' : s))
  }, [])

  const toggle = useCallback(() => {
    setStatus(s => {
      if (s === 'playing') return 'paused'
      if (s === 'ended') return s
      return 'playing'
    })
  }, [])

  const restart = useCallback(() => {
    setIndex(0)
    setWordTick(0)
    setRun(r => r + 1)
    setStatus('playing')
  }, [])

  return {
    status,
    index,
    total,
    line,
    speaker,
    speakingId: status === 'playing' && speaker ? speaker.id : null,
    wordTick,
    mode,
    play,
    pause,
    toggle,
    restart,
  }
}
