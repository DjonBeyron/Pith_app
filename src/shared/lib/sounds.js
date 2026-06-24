import { pLog } from './debug.js'

const cache = {}

const ALL_SOUNDS = ['message-in', 'answer-correct', 'answer-wrong', 'pin-message']

// Call once when player opens — fetches and decodes all audio files so first
// playSound() call fires instantly instead of waiting for HTTP + decode.
export function preloadSounds() {
  ALL_SOUNDS.forEach(name => {
    if (cache[name]) return
    const audio = new Audio(`/sounds/${name}.mp3`)
    audio.preload = 'auto'
    audio.load()
    cache[name] = audio
    pLog(`[sound] preload ${name}`)
  })
}

// Call synchronously inside a user-gesture handler (button click) to unlock iOS Safari
// audio context. Uses throwaway Audio objects at volume=0 so cache objects are never
// paused mid-play — avoids race where unlock's async pause() cuts off a real sound.
export function unlockAudio() {
  ALL_SOUNDS.forEach(name => {
    const tmp = new Audio(`/sounds/${name}.mp3`)
    tmp.volume = 0
    tmp.play().catch(() => {})
  })
  pLog('[sound] unlockAudio called')
}

export function playSound(name) {
  let audio = cache[name]
  if (!audio) {
    audio = new Audio(`/sounds/${name}.mp3`)
    cache[name] = audio
  }
  audio.currentTime = 0
  audio.play()
    .then(() => pLog(`[sound] ${name} OK`))
    .catch(e => pLog(`[sound] ${name} FAILED: ${e.message}`))
}
