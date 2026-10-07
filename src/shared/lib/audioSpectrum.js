// Спектр звукового файла по 4 полосам, покадрово — для свечения в нижних углах чата
// (player/AudioGlow.jsx: низкие частоты → ядро в нижних углах, средние/высокие → вылет вверх по бокам).
//
// НЕ Web Audio на живом <audio> (AnalyserNode на iOS уводит вывод в
// soloAmbient — см. sounds.js): файл один раз декодируется OfflineAudioContext
// (он не трогает аудиосессию iOS), по кадрам SPECTRUM_FPS считается своя
// radix-2 FFT (окно Ханна, FFT_SIZE), энергия 4 полос (<250, 250–900,
// 900–3000, >3000 Гц) нормируется перцентилем — тихий файл светится так же.
// Результат — Uint8Array [frame*4 + band], в памяти (LRU ≤ CACHE_MAX, не в
// localStorage). Считается ЛЕНИВО: по запросу источника после старта игры, в
// requestIdleCallback, по одному файлу за раз (очередь), кадры слайсами —
// слабый Android не лагает. Файл длиннее MAX_SPECTRUM_SEC — пропуск (null →
// источник рисует синтезированные полосы). shared/lib фич не импортирует.
export const BAND_COUNT = 4
export const BAND_EDGES_HZ = [250, 900, 3000]
export const SPECTRUM_FPS = 30
export const FFT_SIZE = 1024
export const MAX_SPECTRUM_SEC = 90
const DECODE_RATE = 22050
const CACHE_MAX = 24
const FRAMES_PER_SLICE = 240
const NORM_PERCENTILE = 0.95
const NORM_FLOOR = 0.06   // нижняя граница опоры полосы — доля от общей (шум не раздувать)
const NORM_POW = 0.6      // сжатие динамики: тихие доли слышны, пики не зашкаливают

// БПФ radix-2 на месте: re/im — Float32Array длины 2^k
export function fft(re, im) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t
      t = im[i]; im[i] = im[j]; im[j] = t
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len
    const wr = Math.cos(ang), wi = Math.sin(ang)
    const half = len >> 1
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let j = 0; j < half; j++) {
        const a = i + j, b = a + half
        const tr = re[b] * cr - im[b] * ci
        const ti = re[b] * ci + im[b] * cr
        re[b] = re[a] - tr; im[b] = im[a] - ti
        re[a] += tr;        im[a] += ti
        const ncr = cr * wr - ci * wi
        ci = cr * wi + ci * wr; cr = ncr
      }
    }
  }
}

// План разбора: окно, принадлежность бинов полосам
function makePlan(sampleRate, fftSize) {
  const window = new Float32Array(fftSize)
  for (let i = 0; i < fftSize; i++) window[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (fftSize - 1))
  const binBand = new Uint8Array(fftSize / 2 + 1)
  const binHz = sampleRate / fftSize
  for (let k = 1; k <= fftSize / 2; k++) {
    const hz = k * binHz
    binBand[k] = hz < BAND_EDGES_HZ[0] ? 0 : hz < BAND_EDGES_HZ[1] ? 1 : hz < BAND_EDGES_HZ[2] ? 2 : 3
  }
  return { window, binBand, re: new Float32Array(fftSize), im: new Float32Array(fftSize), acc: new Float32Array(BAND_COUNT), cnt: new Float32Array(BAND_COUNT) }
}

// Сырые амплитуды полос для кадров [from, to): средняя мощность бинов полосы → корень
function analyzeFrames(samples, sampleRate, fps, fftSize, plan, raw, from, to) {
  const { window, binBand, re, im, acc, cnt } = plan
  const half = fftSize >> 1
  for (let f = from; f < to; f++) {
    const start = Math.round(f * sampleRate / fps) - half
    for (let i = 0; i < fftSize; i++) {
      const s = start + i
      re[i] = s >= 0 && s < samples.length ? samples[s] * window[i] : 0
      im[i] = 0
    }
    fft(re, im)
    acc.fill(0); cnt.fill(0)
    for (let k = 1; k <= half; k++) { const b = binBand[k]; acc[b] += re[k] * re[k] + im[k] * im[k]; cnt[b] += 1 }
    for (let b = 0; b < BAND_COUNT; b++) raw[f * BAND_COUNT + b] = cnt[b] ? Math.sqrt(acc[b] / cnt[b]) : 0
  }
}

// Нормировка: опора полосы — её перцентиль, но не ниже NORM_FLOOR от самой
// громкой полосы (иначе тишина в верхней полосе раздувалась бы до яркости)
export function normalizeBands(raw) {
  const frames = raw.length / BAND_COUNT
  const refs = new Float32Array(BAND_COUNT)
  const col = new Float32Array(frames)
  for (let b = 0; b < BAND_COUNT; b++) {
    for (let f = 0; f < frames; f++) col[f] = raw[f * BAND_COUNT + b]
    col.sort()
    refs[b] = col[Math.min(frames - 1, Math.floor(frames * NORM_PERCENTILE))]
  }
  const top = Math.max(...refs, 1e-9)
  const out = new Uint8Array(raw.length)
  for (let b = 0; b < BAND_COUNT; b++) {
    const ref = Math.max(refs[b], top * NORM_FLOOR)
    for (let f = 0; f < frames; f++) {
      const v = Math.min(1, raw[f * BAND_COUNT + b] / ref)
      out[f * BAND_COUNT + b] = Math.round(255 * Math.pow(v, NORM_POW))
    }
  }
  return out
}

export function frameCount(sampleCount, sampleRate, fps = SPECTRUM_FPS) {
  return Math.max(1, Math.ceil(sampleCount / sampleRate * fps))
}

// Синхронно, целиком (тесты, node): samples — Float32Array моно
export function computeBands(samples, sampleRate, { fps = SPECTRUM_FPS, fftSize = FFT_SIZE } = {}) {
  const frames = frameCount(samples.length, sampleRate, fps)
  const raw = new Float32Array(frames * BAND_COUNT)
  analyzeFrames(samples, sampleRate, fps, fftSize, makePlan(sampleRate, fftSize), raw, 0, frames)
  return normalizeBands(raw)
}

// Слайсами по FRAMES_PER_SLICE кадров с уступкой главному потоку между ними
export async function computeBandsAsync(samples, sampleRate, { fps = SPECTRUM_FPS, fftSize = FFT_SIZE } = {}) {
  const frames = frameCount(samples.length, sampleRate, fps)
  const raw = new Float32Array(frames * BAND_COUNT)
  const plan = makePlan(sampleRate, fftSize)
  for (let from = 0; from < frames; from += FRAMES_PER_SLICE) {
    analyzeFrames(samples, sampleRate, fps, fftSize, plan, raw, from, Math.min(frames, from + FRAMES_PER_SLICE))
    if (from + FRAMES_PER_SLICE < frames) await new Promise(r => setTimeout(r, 0))
  }
  return normalizeBands(raw)
}

// Полосы кадра в момент t (с) → out[0..3] 0..1; false — спектра нет
export function spectrumBandsAt(spec, t, out, fps = SPECTRUM_FPS) {
  if (!spec?.length) return false
  const frames = spec.length / BAND_COUNT
  const i = Math.max(0, Math.min(frames - 1, Math.round(t * fps))) * BAND_COUNT
  for (let b = 0; b < BAND_COUNT; b++) out[b] = spec[i + b] / 255
  return true
}

// ── Кэш и очередь ───────────────────────────────────────────────────────
const cache = new Map()      // key → Uint8Array | null (null — нет/пропущен)
const queued = new Set()
const queue = []
let busy = false

function touch(key, value) {
  cache.delete(key)
  cache.set(key, value)
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value)
}

// Спектр из кэша (null — не готов или его нет); обращение освежает LRU
export function peekSpectrum(key) {
  if (!cache.has(key)) return null
  const v = cache.get(key)
  touch(key, v)
  return v
}

const idle = cb => (typeof requestIdleCallback === 'function' ? requestIdleCallback(cb, { timeout: 1500 }) : setTimeout(cb, 300))

// Поставить файл в очередь разбора (повтор — ничего). src — URL/blob: для fetch
export function requestSpectrum(key, src = key) {
  if (!key || !src || cache.has(key) || queued.has(key)) return
  queued.add(key)
  queue.push({ key, src })
  pump()
}

function pump() {
  if (busy || !queue.length) return
  busy = true
  const job = queue.shift()
  idle(() => analyze(job).finally(() => { busy = false; pump() }))
}

async function analyze({ key, src }) {
  let result = null
  try {
    const Ctx = globalThis.OfflineAudioContext ?? globalThis.webkitOfflineAudioContext
    if (Ctx) {
      const res = await fetch(src)
      const buf = await res.arrayBuffer()
      const audio = await new Ctx(1, 1, DECODE_RATE).decodeAudioData(buf)
      if (audio.duration <= MAX_SPECTRUM_SEC) result = await computeBandsAsync(audio.getChannelData(0), audio.sampleRate)
    }
  } catch { result = null }
  queued.delete(key)
  touch(key, result)
}

// Только для тестов
export function _spectrumTestHooks() {
  return {
    reset() { cache.clear(); queued.clear(); queue.length = 0; busy = false },
    size: () => cache.size,
    keys: () => [...cache.keys()],
    seed: (key, value) => touch(key, value),
  }
}
