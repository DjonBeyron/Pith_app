// «Дубль и зеркало»: где в записи речь (v3.3.101). Запись начинается ещё под плашкой «Дубль…» и кончается по таймеру — до и после фразы много тишины, и при прослушивании «твоя фраза» её слышно.
// Находим начало и конец речи по RMS кусков по 20 мс: порог — относительно шума комнаты (медиана тихих кусков ×3) и пика записи, не ниже абсолютного пола; речью считается кусок, за которым идёт ещё один
// не тише порога (одиночный слабый всплеск речью не считается). Края отодвигаются на PAD_MS (хвосты слов, вдох), в пределах записи. Речи нет (всё тише порога) или обрезать нечего — null: играем запись как есть.
// Чистая функция над Float32Array, без DOM.
const FRAME_S = 0.02
export const PAD_MS = 120      // запас по краям речи
const FLOOR = 0.008            // тише этого — шум, не голос
const NOISE_K = 3              // порог не ниже шума комнаты ×3
const PEAK_K = 0.08            // и не ниже 8 % пика записи (громкие записи: дыхание не речь)
const MIN_TRIM_MS = 200        // выигрыш меньше этого — не обрезаем

/** samples (Float32Array, −1..1), rate (Гц) → { startMs, endMs } (обрезка записи) | null (речи нет или обрезать нечего) */
export function voiceSpan(samples, rate, { padMs = PAD_MS } = {}) {
  const n = Math.max(1, Math.round(rate * FRAME_S))
  const rms = []
  for (let a = 0; a + n <= samples.length; a += n) {
    let sum = 0
    for (let i = a; i < a + n; i++) sum += samples[i] * samples[i]
    rms.push(Math.sqrt(sum / n))
  }
  if (rms.length < 3) return null
  const sorted = [...rms].sort((x, y) => x - y)
  const noise = sorted[Math.floor(sorted.length * 0.3)] // тихая треть записи — шум комнаты
  const thr = Math.max(FLOOR, noise * NOISE_K, sorted.at(-1) * PEAK_K)
  const on = rms.map((v, i) => v >= thr && (v >= thr * 3 || rms[i + 1] >= thr || rms[i - 1] >= thr))
  const first = on.indexOf(true)
  const last = on.lastIndexOf(true)
  if (first < 0) return null
  const totalMs = Math.round(samples.length / rate * 1000)
  const startMs = Math.max(0, Math.round(first * FRAME_S * 1000) - padMs)
  const endMs = Math.min(totalMs, Math.round((last + 1) * FRAME_S * 1000) + padMs)
  if (totalMs - (endMs - startMs) < MIN_TRIM_MS || endMs <= startMs) return null
  return { startMs, endMs }
}
