import { pLog } from './debug.js'

// Web Audio API — one shared AudioContext for the whole session.
// AudioContext can be created anytime; on iOS it starts 'suspended' until
// unlockAudio() calls ctx.resume() inside a user-gesture handler.
let ctx = null
const buffers = {}

const ALL_SOUNDS = ['message-in', 'answer-correct', 'answer-wrong', 'pin-message']

function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)()
    pLog(`[sound] AudioContext created state=${ctx.state}`)
  }
  return ctx
}

// Call during lesson warmup (no gesture needed) — creates AudioContext and
// fetches+decodes all sounds into AudioBuffers while the progress bar runs.
// By the time the user taps "Start", all buffers are ready.
export function preloadSounds() {
  const c = getCtx()
  ALL_SOUNDS.forEach(name => {
    if (buffers[name]) return
    fetch(`/sounds/${name}.mp3`)
      .then(r => r.arrayBuffer())
      .then(ab => c.decodeAudioData(ab))
      .then(buf => {
        buffers[name] = buf
        pLog(`[sound] decoded ${name} dur=${buf.duration.toFixed(2)}s`)
      })
      .catch(e => pLog(`[sound] decode FAILED ${name}: ${e.message}`))
  })
}

// Call synchronously in a gesture handler (button click) — resumes AudioContext.
// On iOS, AudioContext starts 'suspended'; resume() inside a gesture unlocks it
// permanently for the page lifetime. No audio plays — no double-sound issue.
export function unlockAudio() {
  const c = getCtx()
  pLog(`[sound] unlockAudio — ctx.state=${c.state}`)
  if (c.state === 'suspended') {
    c.resume()
      .then(() => pLog(`[sound] AudioContext running`))
      .catch(e => pLog(`[sound] resume FAILED: ${e.message}`))
  }
}

// Instant, synchronous, no Promise — fires exactly when called.
export function playSound(name) {
  const c = ctx
  if (!c) { pLog(`[sound] ${name} SKIP — no AudioContext`); return }
  if (c.state !== 'running') { pLog(`[sound] ${name} SKIP — ctx.state=${c.state}`); return }
  const buf = buffers[name]
  if (!buf) { pLog(`[sound] ${name} SKIP — buffer not ready`); return }
  const src = c.createBufferSource()
  src.buffer = buf
  src.connect(c.destination)
  src.start(0)
  pLog(`[sound] ${name} OK`)
}
