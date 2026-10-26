// Тестовая «озвучка» для стенда: WAV с тремя гудками на 0.3 / 1.6 / 3.1 с и тайминги слов в формате ElevenLabs ([{ w, t }])
export function fakeVoice() {
  const rate = 8000, sec = 4.2, n = Math.floor(rate * sec)
  const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf)
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true)
  const starts = [0.3, 1.6, 3.1]
  for (let i = 0; i < n; i++) {
    const t = i / rate
    const on = starts.some(s => t >= s && t < s + 0.5)
    v.setInt16(44 + i * 2, on ? Math.round(Math.sin(2 * Math.PI * 440 * t) * 9000) : 0, true)
  }
  const url = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
  const waveformData = Array.from({ length: 120 }, (_, k) => { const t = (k / 120) * sec; return starts.some(s => t >= s && t < s + 0.5) ? 0.8 : 0.03 })
  return { url, duration: sec, waveformData, wordTimings: starts.map(t => ({ w: 'try.', t, e: +(t + 0.5).toFixed(2) })) }
}
