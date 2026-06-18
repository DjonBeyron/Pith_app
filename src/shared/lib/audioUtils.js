const WAVEFORM_FPS = 30

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

const FALLBACK_WAVE = [7,11,16,22,14,19,24,17,10,20,13,22,18,11,25,21,15,9,18,24,16,12,21,14,19,10,17,23,15,9,13,19,21,14,17,24,11,18,22,15]

export function drawWaveBar(canvas, data, progress) {
  if (!canvas) return
  const ctx      = canvas.getContext('2d')
  const W        = canvas.width, H = canvas.height
  const barCount = 40
  ctx.clearRect(0, 0, W, H)
  const totalW = W - 4, barW = 2
  const gap = (totalW - barCount * barW) / Math.max(barCount - 1, 1)
  for (let i = 0; i < barCount; i++) {
    const amp  = data?.length
      ? data[Math.floor(i / barCount * data.length)] / 255
      : FALLBACK_WAVE[i % FALLBACK_WAVE.length] / 25
    const barH = Math.max(2, amp * (H - 4))
    const x = 2 + i * (barW + gap), y = (H - barH) / 2
    ctx.fillStyle = i < progress * barCount ? 'rgba(182,254,59,0.9)' : 'rgba(255,255,255,0.22)'
    ctx.beginPath()
    if (ctx.roundRect) ctx.roundRect(x, y, barW, barH, 1)
    else ctx.rect(x, y, barW, barH)
    ctx.fill()
  }
}
