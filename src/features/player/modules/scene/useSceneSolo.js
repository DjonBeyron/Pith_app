import { useEffect } from 'react'
import { isSilentMedia } from '../../useSoloMedia.js'
import { getSceneAudioElement } from '../../../scene/v2/sceneAudioUnlock.js'

// «В переписке звучит что-то одно» для сцены. Общий перехват useSoloMedia
// слушает play у <audio>/<video> внутри плеера, а сцена звучит через
// speechSynthesis или общий <audio> в body (sceneAudioUnlock.js) — ни то, ни
// другое туда не попадает. Поэтому:
//  · сцена заиграла → ставим на паузу всё, что звучит в плеере (кроме немых
//    петель — правило isSilentMedia то же), и просим замолчать другие живые
//    сцены (шина ниже: в ленте одновременно играет одна сцена);
//  · пока сцена играет, запуск чужого <audio>/<video> со звуком (capture на
//    document — элемент может жить и вне плеера) ставит сцену на паузу.

const listeners = new Set()
let token = 0

// Чужой элемент начал звучать — сцене пора на паузу?
export function shouldSceneYield(target, ownAudio) {
  if (!target || typeof target.pause !== 'function') return false
  if (target === ownAudio) return false
  return !isSilentMedia(target)
}

// Другая сцена заиграла — эту ставим на паузу (one-live-scene)
export function claimSceneSolo(myToken) {
  listeners.forEach(fn => fn(myToken))
}

export function useSceneSolo(rootRef, playing, pause) {
  useEffect(() => {
    if (!playing) return undefined
    const my = ++token
    const own = getSceneAudioElement()
    // 1. Заглушить всё, что звучит в плеере
    const player = rootRef.current?.closest?.('.lessonPlayer') ?? document
    player.querySelectorAll('audio, video').forEach(m => {
      if (m !== own && !m.paused && !isSilentMedia(m)) m.pause()
    })
    // 2. Другие сцены — на паузу
    claimSceneSolo(my)
    const onClaim = t => { if (t !== my) pause() }
    listeners.add(onClaim)
    // 3. Чужой звук стартовал — эта сцена на паузу
    const onPlay = e => { if (shouldSceneYield(e.target, own)) pause() }
    document.addEventListener('play', onPlay, true)
    return () => {
      listeners.delete(onClaim)
      document.removeEventListener('play', onPlay, true)
    }
  }, [rootRef, playing, pause])
}
