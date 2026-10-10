// Запись речи ученика ИЗ ТОГО ЖЕ потока Vosk — для режима ноды «голосовое с текстом» («Сказать фразу»). Второго getUserMedia нет: voskEngine.startListening на каждом куске звука
// (до затвора тишины — паузы тоже попадают в запись) отдаёт сюда сырые отсчёты. Звук живёт ТОЛЬКО в памяти страницы: ни IndexedDB, ни localStorage, ни сети здесь нет.
// После итога finish() собирает WAV (PCM16, 16 кГц, моно): обрезает тишину в начале и в конце (порог по RMS, запас PAD_MS), длинные паузы внутри ужимает до MAX_PAUSE_MS
// (воспроизведение не растягивается за счёт медленной речи) и считает PEAK_BARS столбиков статичной волны 0..1. Без флага opts.record в движке рекордера просто нет (память не тратится).
// Защита от переполнения: сверх maxMs + OVER_MS отсчёты не копятся (truncated), клип собирается из того, что успело записаться.
export const REC_RATE = 16000
export const PEAK_BARS = 40
export const FRAME_MS = 20
export const PAD_MS = 150      // запас тишины до первого и после последнего слова
export const MAX_PAUSE_MS = 400 // внутренняя пауза длиннее ужимается до этого
export const MIN_VOICE_MS = 200 // короче — клип не нужен (щелчок)
export const OVER_MS = 2000     // запас сверх потолка попытки
const THR_MIN = 0.006
const THR_MAX = 0.03
const THR_REL = 0.1 // порог голоса = 10% от самого громкого кадра (в пределах THR_MIN..THR_MAX)

/** Float32 -1..1 → Int16 (с отсечением) */
export function toInt16(f32, n = f32.length) {
  const out = new Int16Array(n)
  for (let i = 0; i < n; i++) {
    const v = f32[i]
    out[i] = v >= 1 ? 32767 : v <= -1 ? -32768 : Math.round(v * 32767)
  }
  return out
}

/** Пересчёт Int16 из rate в 16 кГц линейной интерполяцией (AudioContext без поддержки sampleRate:16000 работает на 44,1/48 кГц) */
export function resampleTo16k(s, rate) {
  if (!rate || rate === REC_RATE || !s.length) return s
  const k = rate / REC_RATE
  const n = Math.max(1, Math.floor(s.length / k))
  const out = new Int16Array(n)
  for (let i = 0; i < n; i++) {
    const p = i * k
    const a = Math.floor(p)
    const b = Math.min(s.length - 1, a + 1)
    out[i] = Math.round(s[a] + (s[b] - s[a]) * (p - a))
  }
  return out
}

/** WAV (RIFF, PCM16, моно) как байты: 44 байта заголовка + отсчёты */
export function encodeWavBytes(s, rate = REC_RATE) {
  const bytes = new Uint8Array(44 + s.length * 2)
  const v = new DataView(bytes.buffer)
  const tag = (o, t) => { for (let i = 0; i < 4; i++) v.setUint8(o + i, t.charCodeAt(i)) }
  tag(0, 'RIFF'); v.setUint32(4, 36 + s.length * 2, true); tag(8, 'WAVE')
  tag(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  tag(36, 'data'); v.setUint32(40, s.length * 2, true)
  for (let i = 0; i < s.length; i++) v.setInt16(44 + i * 2, s[i], true)
  return bytes
}

function frameRms(s, from, to) {
  let sum = 0
  for (let i = from; i < to; i++) { const x = s[i] / 32768; sum += x * x }
  return Math.sqrt(sum / Math.max(1, to - from))
}

/** Столбики волны 0..1: RMS равных отрезков клипа, нормированный по самому громкому */
export function wavePeaks(s, bars = PEAK_BARS) {
  const out = new Array(bars).fill(0)
  if (!s.length) return out
  let max = 0
  for (let b = 0; b < bars; b++) {
    const from = Math.floor((b * s.length) / bars)
    const to = Math.max(from + 1, Math.floor(((b + 1) * s.length) / bars))
    out[b] = frameRms(s, from, Math.min(to, s.length))
    if (out[b] > max) max = out[b]
  }
  return max > 0 ? out.map(x => Math.round((x / max) * 1000) / 1000) : out
}

/**
 * Из сырых отсчётов (Int16, частота rate) → клип. { ok: true, blob (audio/wav), durationMs, peaks, truncated } либо { ok: false, reason }:
 * 'empty' (нет звука), 'silent' (весь звук тише порога), 'short' (голоса меньше MIN_VOICE_MS). Чистая функция.
 */
export function buildClip(raw, rate = REC_RATE, { truncated = false } = {}) {
  const s = resampleTo16k(raw, rate)
  const fl = Math.round((REC_RATE * FRAME_MS) / 1000)
  const frames = Math.floor(s.length / fl)
  if (!frames) return { ok: false, reason: 'empty' }
  const rms = []
  let max = 0
  for (let f = 0; f < frames; f++) { const r = frameRms(s, f * fl, (f + 1) * fl); rms.push(r); if (r > max) max = r }
  if (max < THR_MIN) return { ok: false, reason: 'silent' }
  const thr = Math.min(THR_MAX, Math.max(THR_MIN, max * THR_REL))
  const first = rms.findIndex(r => r >= thr)
  const last = rms.length - 1 - [...rms].reverse().findIndex(r => r >= thr)
  if ((last + 1 - first) * FRAME_MS < MIN_VOICE_MS) return { ok: false, reason: 'short' }
  const pad = Math.round(PAD_MS / FRAME_MS)
  const a = Math.max(0, first - pad)
  const z = Math.min(frames, last + 1 + pad)
  // Ужимаем внутренние паузы: от тишины длиннее MAX_PAUSE_MS оставляем по половине с каждого края
  const keepFrames = Math.round(MAX_PAUSE_MS / FRAME_MS)
  const parts = []
  let f = a
  while (f < z) {
    if (rms[f] >= thr) { let e = f; while (e < z && rms[e] >= thr) e++; parts.push([f, e]); f = e; continue }
    let e = f
    while (e < z && rms[e] < thr) e++
    const inner = f > a && e < z // пауза между голосом с обеих сторон; хвосты у краёв уже ограничены запасом
    if (inner && e - f > keepFrames) { parts.push([f, f + keepFrames / 2], [e - keepFrames / 2, e]) } else parts.push([f, e])
    f = e
  }
  const total = parts.reduce((n, [x, y]) => n + (y - x) * fl, 0)
  const out = new Int16Array(total)
  let o = 0
  for (const [x, y] of parts) { out.set(s.subarray(x * fl, y * fl), o); o += (y - x) * fl }
  const durationMs = Math.round((out.length / REC_RATE) * 1000)
  return { ok: true, blob: new Blob([encodeWavBytes(out)], { type: 'audio/wav' }), durationMs, peaks: wavePeaks(out), truncated }
}

/**
 * Буфер записи одного сеанса. push(f32) — сырой кусок звука с частотой rate (копируется в Int16, исходный буфер не держим); finish() → клип (buildClip) и освобождение буфера;
 * reset() — выбросить всё (отмена). Никогда не бросает: ошибка сборки = { ok: false, reason: 'error' }.
 */
export function createRecorder({ rate = REC_RATE, maxMs = 20000 } = {}) {
  let chunks = []
  let count = 0
  let truncated = false
  const limit = Math.ceil((rate * (maxMs + OVER_MS)) / 1000)
  return {
    push(f32) {
      if (!f32?.length) return
      if (count >= limit) { truncated = true; return }
      const take = Math.min(f32.length, limit - count)
      if (take < f32.length) truncated = true
      chunks.push(toInt16(f32, take))
      count += take
    },
    finish() {
      try {
        const all = new Int16Array(count)
        let o = 0
        for (const c of chunks) { all.set(c, o); o += c.length }
        chunks = []
        return buildClip(all, rate, { truncated })
      } catch { return { ok: false, reason: 'error' } } finally { chunks = []; count = 0 }
    },
    reset() { chunks = []; count = 0; truncated = false },
    get samples() { return count },
    get truncated() { return truncated },
  }
}
