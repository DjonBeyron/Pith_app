import { useRef } from 'react'
import { Play, VolumeX, Volume2 } from 'lucide-react'

const SOUND_TOGGLE_COOLDOWN_MS = 500 // как у видео: защита от дребезга частых тапов по чипу

// Иконка паузы и чипы звука слайда-сцены — те же классы и правила показа, что у
// видео (SlideVideo.jsx: .slidePauseIcon / .feedSoundChip, feed-media.css):
// новичку (soundEverOn=false) чип «Включить звук» виден всегда, пока звук выключен;
// кто уже включал — только на паузе. Повторено минимально, а не вынесено из
// SlideVideo: тот файл уже на пределе размера и лишних правок не хочет.
export default function SlideSceneChips({ paused, active, soundOn, soundEverOn, onSoundOn, onSoundOff }) {
  const lastToggleRef = useRef(0)
  function allowed() {
    const now = Date.now()
    if (now - lastToggleRef.current < SOUND_TOGGLE_COOLDOWN_MS) return false
    lastToggleRef.current = now
    return true
  }
  function tapOn(e) {
    e.stopPropagation()
    if (allowed()) onSoundOn?.()
  }
  function tapOff(e) {
    e.stopPropagation()
    if (allowed()) onSoundOff?.()
  }
  if (!active) return null
  return (
    <>
      {paused && (
        <div className="slidePauseIcon">
          <Play fill="currentColor" />
        </div>
      )}
      {!soundOn && (soundEverOn ? paused : true) && (
        <button className="feedSoundChip" onClick={tapOn}>
          <VolumeX fill="currentColor" />
          Включить звук
        </button>
      )}
      {paused && soundOn && (
        <button className="feedSoundChip" onClick={tapOff}>
          <Volume2 />
          Выключить звук
        </button>
      )}
    </>
  )
}
