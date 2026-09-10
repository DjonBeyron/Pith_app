import { pLog } from './debug.js'
import { traceSoundRequest, traceSoundStarted, traceSoundFailed } from './soundTrace.js'

// Hybrid approach for iOS (CriOS) compatibility:
// - AudioContext.resume() in gesture handler properly unlocks the page for all audio.
// - HTMLAudioElement for actual playback — uses iOS 'playback' audio category (speaker output).
//   Web Audio API uses 'soloAmbient' category on iOS, which outputs to earpiece / plays silently.
// - After ctx.resume() in gesture, HTMLAudioElement.play() from setTimeout is instant.

let ctx = null
const htmlCache = {}

const ALL_SOUNDS = ['message-in', 'answer-correct', 'answer-wrong', 'pin-message']

// Call during lesson warmup (no gesture needed).
// Creates AudioContext (suspended) + HTMLAudioElements preloaded into memory.
export function preloadSounds() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)()
    pLog(`[sound] AudioContext created state=${ctx.state}`)
  }
  ALL_SOUNDS.forEach(name => {
    if (htmlCache[name]) return
    const a = new Audio(`/sounds/${name}.mp3`)
    a.preload = 'auto'
    a.load()
    htmlCache[name] = a
    pLog(`[sound] preload ${name}`)
  })
}

// Call synchronously in gesture handler — resumes AudioContext.
// iOS gesture unlock is page-wide: after this, HTMLAudioElement.play() from
// setTimeout fires instantly without the ~700ms first-play delay.
export function unlockAudio() {
  if (!ctx) return
  pLog(`[sound] unlockAudio — ctx.state=${ctx.state}`)
  if (ctx.state === 'suspended') {
    ctx.resume()
      .then(() => pLog(`[sound] AudioContext running`))
      .catch(e => pLog(`[sound] resume FAILED: ${e.message}`))
  }
}

// where — кто просит звук ('word-choice', 'феед', 'таблица'…). В отчёт
// дебага уходит вместе с итогом: по одному «OK» нельзя было понять, почему
// ученик звука не услышал — промис play() резолвится в момент СТАРТА, а
// дальше элемент мог встать на паузу или оборваться (см. soundTrace.js).
export function playSound(name, where = null) {
  let audio = htmlCache[name]
  if (!audio) {
    audio = new Audio(`/sounds/${name}.mp3`)
    htmlCache[name] = audio
  }
  const rec = traceSoundRequest(name, audio, { откуда: where, состояниеCtx: ctx?.state ?? null })
  // Only seek to start if not already there — avoids iOS re-decode stall on fresh objects
  if (audio.currentTime > 0) audio.currentTime = 0
  audio.play()
    .then(() => { traceSoundStarted(rec); pLog(`[sound] ${name} OK${where ? ` (${where})` : ''}`) })
    .catch(e => { traceSoundFailed(rec, e.message); pLog(`[sound] ${name} FAILED: ${e.message}`) })
}
