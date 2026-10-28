// Тестовая «озвучка» для стенда: WAV с гудками и тайминги слов в формате ElevenLabs ([{ w, t, e }]).
// Одно слово — три гудка на 0.3 / 1.6 / 3.1 с (старый таймлайн fills); фраза — по гудку на каждое слово файла (words — слова по порядку высказываний, шаг 0,5 с).
export function fakeVoice(words = null) {
  const rate = 8000
  const starts = words ? words.map((_, i) => +(0.3 + i * 0.5).toFixed(2)) : [0.3, 1.6, 3.1]
  const len = words ? 0.4 : 0.5
  const sec = words ? +(0.3 + words.length * 0.5 + 0.4).toFixed(2) : 4.2
  const n = Math.floor(rate * sec)
  const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf)
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) {
    const t = i / rate
    const k = starts.findIndex(s => t >= s && t < s + len)
    v.setInt16(44 + i * 2, k >= 0 ? Math.round(Math.sin(2 * Math.PI * (330 + (k % 5) * 70) * t) * 9000) : 0, true)
  }
  const url = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
  const waveformData = Array.from({ length: Math.round(sec * 30) }, (_, k) => { const t = (k / (sec * 30)) * sec; return starts.some(s => t >= s && t < s + len) ? 0.8 : 0.03 })
  return { url, duration: sec, waveformData, wordTimings: starts.map((t, i) => ({ w: words ? words[i] : 'try.', t, e: +(t + len).toFixed(2) })) }
}
