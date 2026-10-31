// Ноты отсчёта «Репетиции» (план — rehearsalCountdown.js) синтезируются прямо в AudioBuffer игрового контекста: без WAV, без decodeAudioData и без ожидания — к моменту первой ноты буфер готов всегда.
// Раньше ноты делались WAV-ом «лесенки» награды (makeNoteWav, RMS ≈ 0,08) и декодировались асинхронно: на iPhone при громкости награды 0,5 это ≈ −28 дБ (чистая синусоида почти не слышна на динамике телефона),
// а буфер мог не успеть к первой ноте (она молча пропускалась). Здесь: основной тон + 2-я и 3-я гармоники (динамик телефона плохо играет ~500 Гц, гармоники слышны), RMS COUNT_RMS (≈ −14 дБ), пик не выше COUNT_PEAK.
export const COUNT_RMS = 0.2      // громкость ноты по RMS (доля полной шкалы); у нот награды ≈ 0,08 × громкость награды
export const COUNT_PEAK = 0.9     // пик не выше (иначе масштаб ноты уменьшается: без щелчка перегруза)
export const COUNT_HARMONICS = [1, 0.5, 0.25] // доли основного тона, 2-й и 3-й гармоник
const ATTACK_S = 0.012

/** Отсчёты ноты n плана (countdownPlan) на частоте rate: Float32Array в −1…1. Мягкий вход, затухание к концу, RMS = COUNT_RMS × level, пик ≤ COUNT_PEAK */
export function synthNote(n, rate = 44100) {
  const len = Math.max(1, Math.floor((rate * n.ms) / 1000))
  const attack = Math.max(1, Math.floor(rate * ATTACK_S))
  const out = new Float32Array(len)
  let sumSq = 0
  let peak = 0
  for (let i = 0; i < len; i++) {
    const env = Math.min(1, i / attack) * (1 - i / len) ** 1.4
    let x = 0
    COUNT_HARMONICS.forEach((a, h) => { x += a * Math.sin((2 * Math.PI * n.freq * (h + 1) * i) / rate) })
    out[i] = x * env
    sumSq += out[i] * out[i]
  }
  const rms = Math.sqrt(sumSq / len)
  let k = rms > 0 ? (COUNT_RMS * (n.level ?? 1)) / rms : 0
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]) * k)
  if (peak > COUNT_PEAK) k *= COUNT_PEAK / peak
  for (let i = 0; i < len; i++) out[i] *= k
  return out
}

const cache = new Map() // `${частота}:${k}` → AudioBuffer

/** AudioBuffer ноты n для контекста ctx (создаётся один раз на частоту). null — не вышло (нет createBuffer / исключение) */
export function noteBuffer(ctx, n) {
  const rate = ctx?.sampleRate || 44100
  const key = `${rate}:${n.k}`
  if (cache.has(key)) return cache.get(key)
  try {
    const data = synthNote(n, rate)
    const buf = ctx.createBuffer(1, data.length, rate)
    if (typeof buf.copyToChannel === 'function') buf.copyToChannel(data, 0); else buf.getChannelData(0).set(data)
    cache.set(key, buf)
    return buf
  } catch { return null }
}

/** Игра закрыта: буферы отпускаем */
export const dropNoteBuffers = () => cache.clear()
