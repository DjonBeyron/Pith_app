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

// Call synchronously inside a user-gesture handler (button click) to unlock iOS Safari.
// Uses a throwaway Audio object so the cache objects are never seeked mid-play.
// Seeking currentTime=0 on a playing cache object causes ~600ms re-decode stall on iOS.
export function unlockAudio() {
  const tmp = new Audio('/sounds/message-in.mp3')
  tmp.play().catch(() => {})
  pLog('[sound] unlockAudio called — throwaway play for iOS gesture unlock')
}

export function playSound(name) {
  let audio = cache[name]
  if (!audio) {
    audio = new Audio(`/sounds/${name}.mp3`)
    cache[name] = audio
  }
  // Skip seek if already at start — avoids iOS re-decode stall on first play after unlock
  if (audio.currentTime > 0) audio.currentTime = 0
  audio.play()
    .then(() => pLog(`[sound] ${name} OK`))
    .catch(e => pLog(`[sound] ${name} FAILED: ${e.message}`))
}
