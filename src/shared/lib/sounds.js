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

// Call synchronously inside a user-gesture handler (button click) to force iOS Safari
// to decode all audio. Without this, the first play() from setTimeout has ~700ms latency
// because iOS only decodes on first play() in a gesture context.
export function unlockAudio() {
  ALL_SOUNDS.forEach(name => {
    const audio = cache[name]
    if (!audio) return
    const p = audio.play()
    if (p) p.then(() => { audio.pause(); audio.currentTime = 0 }).catch(() => {})
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
