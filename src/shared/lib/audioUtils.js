export const WAVEFORM_FPS = 30

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
