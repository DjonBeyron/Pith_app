// Нормализация короткого звука в браузере: обрезка тишины по краям → выравнивание громкости по RMS → мягкие края → WAV 16 бит моно.
// Нужна звуку награды игры «Повтори за диктором» (GameSoundsBlock → GameSfxPanel): на iPhone у <audio> нельзя менять volume, поэтому файл
// должен быть тихим сам — тот же уровень, что у синтезированных мяу (scripts/meow/make_meow.mjs: RMS 1300 из 32767 ≈ −28 dBFS).
// Декодирование — OfflineAudioContext (не трогает аудиосессию iOS, как audioEnvelope.js); вся математика — чистые функции над Float32Array (тесты без браузера).

export const SFX_TARGET_RMS = 1300 / 32767 // ≈ 0.0397, −28 dBFS
export const SFX_PEAK_LIMIT = 24000 / 32767 // пик не выше: если цель по RMS даёт больше — громкость снижается, но не клиппирует
export const SFX_RATE = 22050
export const SFX_MAX_SEC = 10 // награда — доли секунды; длиннее не берём (защита от случайно выбранной песни)
const TRIM_WINDOW_MS = 10
const TRIM_REL = 0.06     // окно тише 6 % самого громкого окна (≈ −24 dB) считается тишиной
const TRIM_PAD_MS = 15    // запас вокруг звука, чтобы не срезать мягкий вход
const FADE_IN_MS = 6
const FADE_OUT_MS = 25

/** Среднеквадратичная громкость сэмплов (0…1); пусто → 0 */
export function rmsOf(samples) {
  const n = samples?.length ?? 0
  if (!n) return 0
  let s = 0
  for (let i = 0; i < n; i++) s += samples[i] * samples[i]
  return Math.sqrt(s / n)
}
export function peakOf(samples) {
  let m = 0
  for (let i = 0; i < (samples?.length ?? 0); i++) { const a = Math.abs(samples[i]); if (a > m) m = a }
  return m
}

/** Убрать тишину по краям: окна по 10 мс, граница — первое/последнее окно громче 6 % самого громкого; +15 мс запаса. Полная тишина → пустой массив */
export function trimSilence(samples, rate = SFX_RATE) {
  const n = samples?.length ?? 0
  const win = Math.max(1, Math.round((rate * TRIM_WINDOW_MS) / 1000))
  const count = Math.ceil(n / win)
  if (!count) return new Float32Array(0)
  const levels = new Float32Array(count)
  let top = 0
  for (let w = 0; w < count; w++) {
    levels[w] = rmsOf(samples.subarray(w * win, Math.min(n, (w + 1) * win)))
    if (levels[w] > top) top = levels[w]
  }
  if (top < 1e-5) return new Float32Array(0)
  let first = 0
  while (levels[first] < top * TRIM_REL) first++
  let last = count - 1
  while (levels[last] < top * TRIM_REL) last--
  const pad = Math.round((rate * TRIM_PAD_MS) / 1000)
  return samples.slice(Math.max(0, first * win - pad), Math.min(n, (last + 1) * win + pad))
}

/** Громкость до RMS target (доли от 1); если пик при этом выше peakLimit — множитель снижается до peakLimit. Мягкий вход/выход, чтобы не щёлкало. Возвращает новый массив */
export function normalizeRms(samples, { target = SFX_TARGET_RMS, peakLimit = SFX_PEAK_LIMIT, rate = SFX_RATE } = {}) {
  const out = new Float32Array(samples.length)
  const rms = rmsOf(samples)
  if (!out.length || rms < 1e-6) return out
  let gain = target / rms
  const peak = peakOf(samples) * gain
  if (peak > peakLimit) gain *= peakLimit / peak
  const fi = Math.min(Math.round((rate * FADE_IN_MS) / 1000), out.length >> 1)
  const fo = Math.min(Math.round((rate * FADE_OUT_MS) / 1000), out.length >> 1)
  for (let i = 0; i < out.length; i++) {
    let g = gain
    if (i < fi) g *= i / fi
    const tail = out.length - 1 - i
    if (tail < fo) g *= tail / fo
    out[i] = samples[i] * g
  }
  return out
}

/** Float32 -1…1 → WAV 16 бит моно (Uint8Array с заголовком 44 байта) */
export function encodeWav(samples, rate = SFX_RATE) {
  const n = samples.length
  const buf = new ArrayBuffer(44 + n * 2)
  const v = new DataView(buf)
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true)
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true)
  return new Uint8Array(buf)
}

/** Каналы AudioBuffer → моно (среднее) */
export function mixToMono(channels) {
  if (!channels?.length) return new Float32Array(0)
  if (channels.length === 1) return Float32Array.from(channels[0])
  const out = new Float32Array(channels[0].length)
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i] += ch[i] / channels.length
  return out
}

/** Чистая часть: сэмплы → { wav, rms, peak, ms }. Бросает ошибку, если звук пустой (тишина) или длиннее SFX_MAX_SEC */
export function normalizeSamples(samples, rate = SFX_RATE) {
  if (samples.length / rate > SFX_MAX_SEC) throw new Error(`Файл длиннее ${SFX_MAX_SEC} с — для звука награды нужен короткий звук`)
  const trimmed = trimSilence(samples, rate)
  if (!trimmed.length) throw new Error('В файле тишина — нечего использовать')
  const norm = normalizeRms(trimmed, { rate })
  return { wav: encodeWav(norm, rate), rms: rmsOf(norm), peak: peakOf(norm), ms: Math.round((norm.length / rate) * 1000) }
}

/** ArrayBuffer (mp3/wav/m4a) → { wav, rms, peak, ms }. Ошибка с понятным текстом, если нет OfflineAudioContext или файл не разобрался */
export async function normalizeToWav(arrayBuffer) {
  const Ctx = globalThis.OfflineAudioContext ?? globalThis.webkitOfflineAudioContext
  if (!Ctx) throw new Error('Браузер не умеет разбирать звук (OfflineAudioContext)')
  let audio
  try { audio = await new Ctx(1, 1, SFX_RATE).decodeAudioData(arrayBuffer) } catch { throw new Error('Не удалось разобрать файл: нужен wav, mp3 или m4a') }
  const channels = Array.from({ length: audio.numberOfChannels }, (_, c) => audio.getChannelData(c))
  return normalizeSamples(mixToMono(channels), audio.sampleRate)
}
