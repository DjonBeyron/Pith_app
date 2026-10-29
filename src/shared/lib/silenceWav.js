// Тихий WAV для «пробуждения» <audio> в жесте: iOS разрешает элементу играть по таймеру, только если он хоть раз стартовал по тапу. Сначала элемент играет тишину, потом ему подставляют настоящий звук.
// Один blob-адрес на страницу (кэш); 8-бит беззнаковый PCM, 128 — тишина. Нужен проигрывателю слов (word-audio) после прерывания аудиосессии; слоты игры держат свои копии (wordLaneClips / wordLaneNotes).

/** WAV (моно, 8 бит) из ms миллисекунд тишины при частоте rate */
export function makeSilenceWav(ms = 80, rate = 8000) {
  const n = Math.floor((rate * ms) / 1000)
  const buf = new ArrayBuffer(44 + n)
  const v = new DataView(buf)
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true)
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true)
  str(36, 'data'); v.setUint32(40, n, true)
  new Uint8Array(buf, 44).fill(128)
  return new Uint8Array(buf)
}

let url = null
/** Адрес тишины (blob:) — один на страницу; null, если blob недоступен (тогда элемент будят сразу настоящим звуком) */
export function silenceWavUrl() {
  if (url) return url
  try { url = URL.createObjectURL(new Blob([makeSilenceWav()], { type: 'audio/wav' })) } catch { url = null }
  return url
}
