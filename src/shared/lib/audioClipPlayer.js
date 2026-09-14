import { audioClipAt } from './audioClips.js'

// <audio> идёт ВСЛЕД за часами таймлайна по нарезке audioClips: мастер-время
// крутят часы (silentClock.js), а этот модуль на каждом кадре смотрит, в
// какой клип озвучки попал момент t, и ведёт элемент: на входе в клип —
// перемотка на нужную секунду файла и play, в тишине между клипами — pause,
// при расхождении больше DRIFT_S — подстройка. Общий для редактора
// (прослушивание нарезки) и плеера (игра на телефоне).
//
// Почему <audio>, а не Web Audio с точным расписанием: на iOS Web Audio
// играет в категории soloAmbient — разговорный динамик и тишина при
// выключенном звонке (см. sounds.js). <audio> — обычная «playback».

export const DRIFT_S = 0.25

// Принимает refs (а не значения): элемент и нарезка меняются, проигрыватель — нет
export function createAudioClipPlayer({ audioRef, clipsRef }) {
  let currentId = null
  const getAudio = () => audioRef.current
  const getClips = () => clipsRef.current

  function pause() {
    const a = getAudio()
    if (a && !a.paused) a.pause()
    currentId = null
  }

  // Звать на каждом кадре. playing=false — часы стоят, звук тоже
  function tick(t, playing) {
    const a = getAudio()
    if (!a) return
    if (!playing) { if (!a.paused) pause(); return }
    const clip = audioClipAt(getClips(), t)
    if (!clip) { if (currentId != null) pause(); return }
    const want = clip.from + (t - clip.at)
    if (clip.id !== currentId) {
      currentId = clip.id
      a.currentTime = want
      a.play?.()?.catch?.(() => {})
      return
    }
    if (a.paused) a.play?.()?.catch?.(() => {})
    else if (Math.abs(a.currentTime - want) > DRIFT_S) a.currentTime = want
  }

  // После перемотки часов — забыть текущий клип, следующий tick пересинхронит
  function reset() { pause() }

  return { tick, reset, pause }
}
