export const WAVEFORM_FPS = 30

const BAR_W   = 2
const BAR_GAP = 2
const ACCENT  = '#b6fe3b'
const MUTED   = 'rgba(255,255,255,0.25)'

// Draw waveform bars on a canvas element.
// waveData — Uint8 array 0-255 from analyzeWaveform (or null for flat bars).
// progress — 0..1, bars up to this point are drawn in ACCENT colour.
export function drawWaveBar(canvas, waveData, progress = 0) {
  if (!canvas) return
  const dpr = window.devicePixelRatio || 1
  const w   = canvas.clientWidth
  const h   = canvas.clientHeight
  if (!w || !h) return
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width  = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
  }
  const ctx   = canvas.getContext('2d')
  const count = Math.max(1, Math.floor(w / (BAR_W + BAR_GAP)))
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.save()
  ctx.scale(dpr, dpr)
  for (let i = 0; i < count; i++) {
    const amp = waveData?.length
      ? Math.pow(waveData[Math.floor(i / count * waveData.length)] / 255, 0.55)
      : 0.15
    const barH  = Math.max(2, amp * h * 0.9)
    const x     = i * (BAR_W + BAR_GAP)
    const y     = (h - barH) / 2
    ctx.fillStyle = i / count < progress ? ACCENT : MUTED
    ctx.beginPath()
    ctx.roundRect(x, y, BAR_W, barH, 1)
    ctx.fill()
  }
  ctx.restore()
}

export function fmtAudioTime(sec) {
  if (sec == null || isNaN(sec) || !isFinite(sec) || sec < 0) return '0:00'
  const s = Math.max(0, Math.round(sec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function probeAudioDuration(url) {
  return new Promise(resolve => {
    const a = new Audio(url)
    a.preload = 'metadata'
    a.addEventListener('loadedmetadata', () => resolve(a.duration), { once: true })
    a.addEventListener('error',          () => resolve(null),       { once: true })
  })
}

export async function analyzeWaveform(url) {
  const resp        = await fetch(url)
  const arrayBuffer = await resp.arrayBuffer()
  const audioCtx    = new (window.AudioContext || window.webkitAudioContext)()
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
  audioCtx.close()
  const frameSize = Math.floor(audioBuffer.sampleRate / WAVEFORM_FPS)
  const data = audioBuffer.getChannelData(0)
  const rms  = []
  for (let i = 0; i < data.length; i += frameSize) {
    let sum = 0
    const end = Math.min(i + frameSize, data.length)
    for (let j = i; j < end; j++) sum += data[j] * data[j]
    rms.push(Math.sqrt(sum / (end - i)))
  }
  const sorted = [...rms].sort((a, b) => a - b)
  const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0.001
  return rms.map(v => Math.round(Math.min(v / p99, 1) * 255))
}
