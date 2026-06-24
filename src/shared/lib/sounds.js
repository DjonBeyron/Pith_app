import { pLog } from './debug.js'

const cache = {}
const skipNext = {}

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
// Plays message-in for real (volume=1) in gesture context — iOS only unlocks on audible play.
// Sets skipNext so the first PlayerFeed message-in is suppressed (no duplicate sound).
export function unlockAudio() {
  if (!cache['message-in']) {
    cache['message-in'] = new Audio('/sounds/message-in.mp3')
    cache['message-in'].preload = 'auto'
  }
  cache['message-in'].currentTime = 0
  cache['message-in'].play().catch(() => {})
  skipNext['message-in'] = true
  pLog('[sound] unlockAudio called — message-in pre-played, next suppressed')
}

export function playSound(name) {
  if (skipNext[name]) {
    delete skipNext[name]
    pLog(`[sound] ${name} skipped (pre-played by unlock)`)
    return
  }
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
