// «Дубль и зеркало»: громкость голоса в записи. Средний RMS только по «голосовым» кускам (по 20 мс): тишина до и после фразы не должна занижать цифру. Чистая функция, без DOM.
const FRAME_S = 0.02
const FLOOR = 0.008        // тише этого — шум комнаты, не голос
const REL = 0.25           // кусок считается голосом, если его RMS не меньше этой доли самого громкого куска

/** Средний RMS голоса (0..1) по отсчётам samples (Float32Array, −1..1) при частоте rate; нет голоса — 0 */
export function voicedRms(samples, rate) {
  const n = Math.max(1, Math.round(rate * FRAME_S))
  const frames = []
  for (let a = 0; a + n <= samples.length; a += n) {
    let sum = 0
    for (let i = a; i < a + n; i++) sum += samples[i] * samples[i]
    frames.push(sum / n)
  }
  if (!frames.length) return 0
  const peak = Math.sqrt(Math.max(...frames))
  const min = Math.max(FLOOR, peak * REL)
  const voiced = frames.filter(m => Math.sqrt(m) >= min)
  if (!voiced.length) return 0
  return Math.min(1, Math.sqrt(voiced.reduce((s, m) => s + m, 0) / voiced.length))
}

/** Декодировать записанный/скачанный звук (Blob) → { rms, durationMs } или null (нет WebAudio / файл не разобрался) */
export async function analyzeBlob(blob) {
  try {
    const Ctx = typeof window !== 'undefined' ? window.OfflineAudioContext || window.webkitOfflineAudioContext : null
    if (!Ctx || !blob?.arrayBuffer) return null
    const audio = await new Ctx(1, 1, 44100).decodeAudioData(await blob.arrayBuffer())
    const ch = audio.numberOfChannels
    const mono = new Float32Array(audio.length)
    for (let c = 0; c < ch; c++) { const d = audio.getChannelData(c); for (let i = 0; i < mono.length; i++) mono[i] += d[i] / ch }
    return { rms: voicedRms(mono, audio.sampleRate), durationMs: Math.round(audio.duration * 1000) }
  } catch { return null }
}
