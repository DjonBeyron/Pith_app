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
// Plays message-in for real (volume=1) in gesture context — iOS only unlocks on audible play.
// The sound acts as button-tap feedback; the first in-chat message will play it again
// instantly (~150ms later) since iOS audio is now unlocked for the page.
export function unlockAudio() {
  if (!cache['message-in']) {
    cache['message-in'] = new Audio('/sounds/message-in.mp3')
    cache['message-in'].preload = 'auto'
  }
  cache['message-in'].currentTime = 0
  cache['message-in'].play().catch(() => {})
  pLog('[sound] unlockAudio called — message-in pre-played as button feedback')
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
