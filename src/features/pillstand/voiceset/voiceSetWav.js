// Звук клипа «Записи набора» (v3.3.188, CONCEPT_VOICESET.md): передискретизация в 16 кГц и WAV PCM 16 бит моно. Сжатия нет — прогонщику нужен тот же звук, что слышал микрофон.
// resample — полифазный КИХ-фильтр (оконный sinc, окно Блэкмана): ФНЧ с частотой среза 0,475 × новая частота (7,6 кГц для 16 кГц: полоса до ≈ 6,9 кГц ровная, выше 8,3 кГц — глубже −70 дБ,
// зеркальных частот нет), усиление на постоянном токе ровно 1 (уровни клипа не меняются). Линейная интерполяция voskRecord.resampleTo16k сюда не годится: без ФНЧ шипящие «s», «f»
// отражаются в полосу речи. 48000 → 16000 — одна фаза фильтра, 44100 → 16000 — 160 фаз. Чистые функции.
export const SET_RATE = 16000
const ZC = 32          // нулей sinc с каждой стороны: чем больше, тем круче срез
const CUT = 0.475      // частота среза в долях новой частоты
const MAX_PHASES = 2048

const gcd = (a, b) => (b ? gcd(b, a % b) : a)

/** Float32 → Float32 на частоте to (from === to — тот же массив) */
export function resample(x, from, to = SET_RATE) {
  if (!x.length || !from || from === to) return x
  const g = gcd(Math.round(from), Math.round(to)), L = Math.round(to) / g, M = Math.round(from) / g
  const fc = CUT * Math.min(from, to) / from      // срез в циклах на отсчёт входа
  const half = Math.ceil(ZC / (2 * fc))           // полуширина фильтра во входных отсчётах
  const taps = 2 * half + 1
  const tap = (k, frac) => { // вес входного отсчёта со сдвигом k от целой части позиции; frac — дробная часть позиции
    const t = k - frac, a = t / half
    if (Math.abs(a) >= 1) return 0
    const s = t === 0 ? 1 : Math.sin(2 * Math.PI * fc * t) / (2 * Math.PI * fc * t)
    return 2 * fc * s * (0.42 + 0.5 * Math.cos(Math.PI * a) + 0.08 * Math.cos(2 * Math.PI * a))
  }
  const phase = p => { // коэффициенты одной фазы, сумма = 1
    const h = new Float32Array(taps); let sum = 0
    for (let j = 0; j < taps; j++) { h[j] = tap(j - half, p / L); sum += h[j] }
    for (let j = 0; j < taps; j++) h[j] /= sum
    return h
  }
  const table = L <= MAX_PHASES ? Array.from({ length: L }, (_, p) => phase(p)) : null
  const n = Math.floor(x.length * L / M), out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const pos = i * M, n0 = Math.floor(pos / L), h = table ? table[pos % L] : phase(pos % L)
    const a = Math.max(0, n0 - half), b = Math.min(x.length - 1, n0 + half)
    let s = 0
    for (let k = a; k <= b; k++) s += x[k] * h[k - n0 + half]
    out[i] = s
  }
  return out
}

/** Float32 −1…1 → WAV PCM16 моно: { bytes: Uint8Array, clipped — сколько отсчётов упёрлось в потолок } */
export function encodeWav(x, rate = SET_RATE) {
  const n = x.length, bytes = new Uint8Array(44 + n * 2), v = new DataView(bytes.buffer)
  const str = (o, s) => { for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i) }
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true)
  let clipped = 0
  for (let i = 0; i < n; i++) {
    const s = x[i]
    if (s >= 1 || s <= -1) clipped++
    v.setInt16(44 + i * 2, s >= 1 ? 32767 : s <= -1 ? -32768 : Math.round(s * 32767), true)
  }
  return { bytes, clipped }
}

/** WAV PCM16 → { rate, channels, bits, samples: Float32Array (первый канал) } — тесты и проверка архива */
export function decodeWav(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), v = new DataView(u.buffer, u.byteOffset, u.byteLength)
  const tag = o => String.fromCharCode(u[o], u[o + 1], u[o + 2], u[o + 3])
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('не WAV')
  let o = 12, fmt = null
  while (o + 8 <= u.length) {
    const id = tag(o), len = v.getUint32(o + 4, true)
    if (id === 'fmt ') fmt = { format: v.getUint16(o + 8, true), channels: v.getUint16(o + 10, true), rate: v.getUint32(o + 12, true), bits: v.getUint16(o + 22, true) }
    if (id === 'data') {
      if (!fmt || fmt.format !== 1 || fmt.bits !== 16) throw new Error('нужен WAV PCM 16 бит')
      const n = Math.floor(Math.min(len, u.length - o - 8) / 2 / fmt.channels), samples = new Float32Array(n)
      for (let i = 0; i < n; i++) samples[i] = v.getInt16(o + 8 + i * 2 * fmt.channels, true) / 32768
      return { rate: fmt.rate, channels: fmt.channels, bits: fmt.bits, samples }
    }
    o += 8 + len + (len & 1)
  }
  throw new Error('в WAV нет данных')
}

/** Куски Float32 → один массив */
export function joinChunks(chunks) {
  const out = new Float32Array(chunks.reduce((s, c) => s + c.length, 0))
  let o = 0
  for (const c of chunks) { out.set(c, o); o += c.length }
  return out
}
