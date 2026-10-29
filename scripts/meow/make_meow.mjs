#!/usr/bin/env node
// Офлайн-синтез кошачьего «мяу» для награды в игре «Повтори за диктором» (три тона лесенки). Чистый node, без зависимостей.
//   node scripts/meow/make_meow.mjs                       — выбранный тембр (PICK) → public/sounds/meow-{1,2,3}.wav
//   node scripts/meow/make_meow.mjs --voice b             — другой тембр в public/sounds
//   node scripts/meow/make_meow.mjs --preview <папка>     — ещё и все тембры va/vb/vc: v{x}-{1,2,3}.wav и v{x}-ladder.wav («мяу-мяу-мяу») для прослушивания
// Формат: WAV 22050 Гц, 16 бит, моно. Громкость: RMS = TARGET_RMS (вдвое тише прежних нот игры — там 2600), пик ≤ PEAK_LIMIT.
//
// Как устроено («источник — фильтр»): основной тон f0(t) ведёт кривая высоты с вибрато и дрожанием; звук — сумма его гармоник (1/h в степени «крутизны»),
// каждая взвешена двумя резонансами (форманты F1 ≈ 900 и F2 ≈ 2200 Гц, лоренцева кривая). Слог «м-я-у» делается движением формант и яркости во времени:
// «м» — тихо и глухо (форманты низко, обрезаны верха), «я» — открыто и ярко, «у» — спад и форманты вниз; в конце затухание. Плюс шум дыхания (−27…−30 дБ),
// пропущенный через полосовой биквад у формант. Три тона лесенки — это одна и та же кривая высоты, умноженная на 1, 1.26 (б. терция) и 1.5 (квинта).
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'

export const RATE = 22050
export const TARGET_RMS = 1300   // из 32767; у прежних нот 2600 (и ×1.2 у финала)
export const PEAK_LIMIT = 20000
export const PICK = 'a'          // тембр, который кладётся в public/sounds
export const RATIOS = [1, 1.26, 1.5]
export const EXTRA_MS = [0, 0, 60] // третье мяу чуть длиннее
export const GAP_MS = 140          // пауза между мяу в «лесенке» для прослушивания

// Параметры тембров. pitch — ключи [доля длины, Гц]; ms — длина первых двух мяу.
// f1/f2 и b — форманты и яркость F2 для «я»; m* — для «м» (нос), u* — для «у». dull — доп. крутизна спада гармоник («глухота»).
export const VOICES = {
  a: { title: 'Мягкая кошка', ms: 460, pitch: [[0, 540], [0.13, 560], [0.38, 760], [0.7, 640], [1, 480]],
       f1: 900, f2: 2200, b2: 0.6, w1: 220, w2: 420, slope: 1.1, vibHz: 6, vib: 0.03, jitter: 0.004, breathDb: -30,
       attackMs: 25, mMs: 60, riseMs: 50, mAmp: 0.3, mF1: 320, mF2: 1100, mB: 0.2, mDull: 1.2, uAt: 0.55, uAmp: 0.55, uF1: 450, uF2: 950, uB: 0.3, uDull: 0.5, releaseMs: 120 },
  b: { title: 'Котёнок', ms: 430, pitch: [[0, 640], [0.12, 670], [0.32, 880], [0.65, 740], [1, 560]],
       f1: 1000, f2: 2500, b2: 0.8, w1: 240, w2: 450, slope: 0.9, vibHz: 7, vib: 0.025, jitter: 0.005, breathDb: -27,
       attackMs: 20, mMs: 50, riseMs: 40, mAmp: 0.35, mF1: 360, mF2: 1300, mB: 0.25, mDull: 0.9, uAt: 0.5, uAmp: 0.5, uF1: 520, uF2: 1100, uB: 0.35, uDull: 0.4, releaseMs: 110 },
  c: { title: 'Сонный кот', ms: 500, pitch: [[0, 430], [0.15, 450], [0.4, 620], [0.72, 520], [1, 380]],
       f1: 780, f2: 1900, b2: 0.5, w1: 200, w2: 380, slope: 1.4, vibHz: 5, vib: 0.04, jitter: 0.01, breathDb: -28,
       attackMs: 30, mMs: 80, riseMs: 60, mAmp: 0.3, mF1: 290, mF2: 950, mB: 0.15, mDull: 1.5, uAt: 0.58, uAmp: 0.6, uF1: 400, uF2: 820, uB: 0.25, uDull: 0.7, releaseMs: 140 },
}

// Воспроизводимый «случайный» поток (шум и дрожание одинаковы при каждом запуске)
function mulberry32(seed) {
  let a = seed >>> 0
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

// Плавная (косинусная) интерполяция по ключам [[t, v], ...]
function track(keys) {
  return t => {
    if (t <= keys[0][0]) return keys[0][1]
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1] = keys[i]
      if (t <= t1) { const [t0, v0] = keys[i - 1]; const u = t1 > t0 ? (t - t0) / (t1 - t0) : 1; return v0 + (v1 - v0) * (1 - Math.cos(Math.PI * u)) / 2 }
    }
    return keys[keys.length - 1][1]
  }
}

// Дорожки слога «м-я-у» для длины T (сек): громкость, F1, F2, яркость F2, «глухота»
function syllable(v, T) {
  const m = v.mMs / 1000, r = m + v.riseMs / 1000, u = T * v.uAt, e = T - v.releaseMs / 1000
  const make = (mv, yv, uv) => track([[0, mv], [m, mv], [r, yv], [u, yv], [e, uv], [T, uv]])
  return {
    amp: track([[0, 0], [v.attackMs / 1000, v.mAmp], [m, v.mAmp], [r, 1], [u, 1], [e, v.uAmp], [T, 0]]),
    f1: make(v.mF1, v.f1, v.uF1), f2: make(v.mF2, v.f2, v.uF2), bright: make(v.mB, 1, v.uB), dull: make(v.mDull, 0, v.uDull),
  }
}

// Полосовой биквад (RBJ, пик 0 дБ): коэффициенты для центра fc и добротности q
function bandpass(fc, q) {
  const w = 2 * Math.PI * Math.min(fc, RATE * 0.45) / RATE, al = Math.sin(w) / (2 * q), a0 = 1 + al
  return { b0: al / a0, b2: -al / a0, a1: -2 * Math.cos(w) / a0, a2: (1 - al) / a0 }
}

/** Одно мяу: кривая высоты × ratio, длина ms + extraMs; нормировано по RMS (TARGET_RMS), пик ≤ PEAK_LIMIT → Int16Array */
export function synthMeow(v, ratio = 1, extraMs = 0, seed = 7) {
  const N = Math.floor(RATE * (v.ms + extraMs) / 1000), T = N / RATE
  const rnd = mulberry32(seed), S = syllable(v, T), pitch = track(v.pitch.map(([f, hz]) => [f * T, hz * ratio]))
  const voice = new Float64Array(N), noise = new Float64Array(N)
  let phase = 0, jit = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0, bq = bandpass(1500, 1.2)
  for (let i = 0; i < N; i++) {
    const t = i / RATE, amp = S.amp(t)
    jit = jit * 0.995 + (rnd() - 0.5) * v.jitter * 0.4 // медленное дрожание высоты
    const vib = v.vib * Math.min(1, Math.max(0, (t - 0.08) / 0.12)) * Math.sin(2 * Math.PI * v.vibHz * t) // вибрато входит после «м»
    const f0 = pitch(t) * (1 + vib + jit)
    phase += f0 / RATE
    const F1 = S.f1(t), F2 = S.f2(t), br = S.bright(t), slope = v.slope + S.dull(t)
    let s = 0
    for (let h = 1; h * f0 < 5500; h++) {
      const fh = h * f0
      const g = 0.04 + 1 / (1 + ((fh - F1) / v.w1) ** 2) + v.b2 * br / (1 + ((fh - F2) / v.w2) ** 2)
      s += Math.sin(2 * Math.PI * h * (phase % 1)) * g / h ** slope
    }
    voice[i] = s * amp
    if (i % 32 === 0) bq = bandpass((F1 + F2) / 2, 1.2) // шум дыхания — между формантами
    const w = rnd() * 2 - 1, y = bq.b0 * w + bq.b2 * x2 - bq.a1 * y1 - bq.a2 * y2
    x2 = x1; x1 = w; y2 = y1; y1 = y
    noise[i] = y * amp
  }
  const rms = a => Math.sqrt(a.reduce((q, x) => q + x * x, 0) / Math.max(1, a.length))
  const kn = rms(noise) > 0 ? rms(voice) * 10 ** (v.breathDb / 20) / rms(noise) : 0
  const mix = voice.map((x, i) => x + noise[i] * kn)
  let gain = TARGET_RMS / rms(mix)
  const peak = mix.reduce((m, x) => Math.max(m, Math.abs(x)), 0) * gain
  if (peak > PEAK_LIMIT) gain *= PEAK_LIMIT / peak
  return Int16Array.from(mix, x => Math.round(x * gain))
}

/** Int16 → WAV (16 бит, моно, RATE Гц) → Buffer */
export function toWav(samples) {
  const n = samples.length, b = Buffer.alloc(44 + n * 2)
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34)
  b.write('data', 36); b.writeUInt32LE(n * 2, 40)
  samples.forEach((x, i) => b.writeInt16LE(x, 44 + i * 2))
  return b
}

/** Три мяу лесенки выбранного тембра (Int16Array × 3) */
export function meowSet(voiceKey = PICK) {
  return RATIOS.map((r, k) => synthMeow(VOICES[voiceKey], r, EXTRA_MS[k]))
}

/** «Мяу-мяу-мяу» подряд с паузами — для прослушивания лесенки целиком */
export function ladder(set) {
  const gap = new Int16Array(Math.floor(RATE * GAP_MS / 1000))
  const parts = set.flatMap((s, k) => (k ? [gap, s] : [s]))
  const out = new Int16Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  parts.forEach(p => { out.set(p, o); o += p.length })
  return out
}

function main(argv) {
  const arg = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const pick = arg('--voice') ?? PICK
  if (!VOICES[pick]) throw new Error(`нет тембра ${pick}; есть: ${Object.keys(VOICES).join(', ')}`)
  const outDir = resolve(arg('--out') ?? join(root, 'public/sounds'))
  mkdirSync(outDir, { recursive: true })
  meowSet(pick).forEach((s, k) => writeFileSync(join(outDir, `meow-${k + 1}.wav`), toWav(s)))
  console.log(`meow-1..3.wav (тембр ${pick}: ${VOICES[pick].title}) → ${outDir}`)
  const prev = arg('--preview')
  if (prev) {
    mkdirSync(prev, { recursive: true })
    for (const key of Object.keys(VOICES)) {
      const set = meowSet(key)
      set.forEach((s, k) => writeFileSync(join(prev, `v${key}-${k + 1}.wav`), toWav(s)))
      writeFileSync(join(prev, `v${key}-ladder.wav`), toWav(ladder(set)))
      console.log(`v${key}-{1,2,3,ladder}.wav — ${VOICES[key].title}`)
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2))
