// WAV-клипы из отсчётов (моно, 16 бит): нарезка записи автора на высказывания и тихие wav для «пробуждения» <audio>-слотов. Отделено от wordLaneClips.js (слоты, буферы Web Audio).
export const FADE_IN_S = 0.004
export const FADE_OUT_S = 0.012

/** Ключ отрезка файла: у одного отрезка (высказывания) один элемент на все повторы */
export const spanKey = span => `${span.start.toFixed(3)}-${span.end.toFixed(3)}`

/** WAV (моно, 16 бит) из куска samples [start, end) секунд при частоте rate; края сглажены (без щелчков) */
export function sliceToWav(samples, rate, start, end) {
  const a = Math.max(0, Math.floor(start * rate))
  const b = Math.min(samples.length, Math.ceil(end * rate))
  const n = Math.max(0, b - a)
  const buf = new ArrayBuffer(44 + n * 2)
  const v = new DataView(buf)
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true)
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, n * 2, true)
  const fin = Math.floor(FADE_IN_S * rate)
  const fout = Math.floor(FADE_OUT_S * rate)
  for (let i = 0; i < n; i++) {
    let g = 1
    if (i < fin) g = i / fin
    else if (i >= n - fout) g = (n - 1 - i) / fout
    const x = Math.max(-1, Math.min(1, samples[a + i] * g))
    v.setInt16(44 + i * 2, Math.round(x * 32767), true)
  }
  return new Uint8Array(buf)
}
