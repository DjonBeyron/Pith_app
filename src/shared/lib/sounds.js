import { pLog } from './debug.js'

const cache = {}

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
