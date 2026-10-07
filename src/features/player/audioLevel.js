import { WAVEFORM_FPS } from '../../shared/lib/audioUtils.js'

// Общий «уровень звука» урока для свечения снизу чата (AudioGlow.jsx).
// Чистое состояние без React: источники (голосовое, слово, диктор таблицы,
// видео/кружок/стикер со звуком, звуки интерфейса) регистрируют
// getLevel(now) → 0..1 и, если есть, getBands(now, out4) — настоящий спектр по
// 4 полосам (shared/lib/audioSpectrum.js), иначе полосы синтезируются по
// характеру источника (profile). Один общий rAF-цикл живёт ТОЛЬКО пока есть
// играющие источники и подписчик, не чаще LEVEL_FPS, берёт максимум по
// источникам, сглаживает (быстрая атака, БЫСТРЫЙ спад — свет гаснет вместе
// со звуком, не тянется) и отдаёт подписчику уровень + полосы.
//
// НЕ Web Audio на живом <audio> (createMediaElementSource/AnalyserNode): на
// iOS это переводит вывод в категорию soloAmbient — звук уходит в
// разговорный динамик или молчит (см. sounds.js). Уровень — из
// ПРЕДРАСЧИТАННЫХ данных: waveformData (RMS по кадрам WAVEFORM_FPS) или
// синтезированная огибающая; спектр — из офлайн-разбора файла.

export const LEVEL_FPS = 30
export const BANDS = 4
const FRAME_MS = 1000 / LEVEL_FPS
const ATTACK  = 0.6    // доля пути к новому уровню за кадр, когда он выше
const RELEASE = 0.42   // …и когда ниже: за 8 кадров из 1 → 0.013

// Порог «микро-звука»: источник тише MIN_LEVEL считается неактивным — не
// поддерживает свечение, нулевой вклад (паузы между словами голосового не
// дают «остаточного» света). Гистерезис, чтобы не мигало на границе: включается
// при уровне ≥ MIN_LEVEL, выключается при < MIN_LEVEL_OFF. Полоса ниже
// BAND_FLOOR — 0 (и у источника, и в сглаженном выходе)
export const MIN_LEVEL     = 0.12
export const MIN_LEVEL_OFF = 0.08
export const BAND_FLOOR    = 0.08

const sources   = new Map()   // id → { getLevel, getBands, profile, on }
const listeners = new Set()   // fn(level 0..1, active, now, bands Float32Array(4))
let rafId = 0
let running = false
let lastFrameAt = -Infinity
let smoothed = 0
let shown = false             // подписчикам сейчас сказано «светим» (active=true)
const bandsSm = new Float32Array(BANDS)   // сглаженные полосы (состояние)
const bands = new Float32Array(BANDS)     // выход: сглаженные, ниже BAND_FLOOR → 0
const frameMax = new Float32Array(BANDS)
const tmp = new Float32Array(BANDS)
let visibilityHooked = false

// Окружение подменяется в тестах (fake rAF/время/скрытая вкладка)
let env = {
  raf: cb => requestAnimationFrame(cb),
  caf: id => cancelAnimationFrame(id),
  hidden: () => typeof document !== 'undefined' && document.hidden === true,
}

const clamp01 = v => (v > 1 ? 1 : v < 0 || !(v >= 0) ? 0 : v)

// Уровень в момент t по волне wd (RMS 0..255 по кадрам fps, как у HUD-баров
// диктанта: та же степень 0.55, чтобы тихая речь не терялась). Нет волны —
// синтезированная огибающая
export function levelFromWave(wd, t, fps = WAVEFORM_FPS) {
  if (!wd?.length) return speechEnvelope(t)
  const i = Math.max(0, Math.min(wd.length - 1, Math.round(t * fps)))
  return Math.pow(clamp01(wd[i] / 255), 0.55)
}

// Огибающая «речи» для источников без волны (короткий mp3 слова, видео):
// плавный псевдошум 0.35..0.85 по времени, короткий вход, затухание на
// последних 0.15с, если длительность известна (у <audio> до метаданных NaN)
export function speechEnvelope(t, duration = 0) {
  if (!(t >= 0)) return 0
  const noise = Math.sin(t * 9.3) * 0.6 + Math.sin(t * 23.7 + 1.1) * 0.25 + Math.sin(t * 3.1 + 2.3) * 0.15
  const base  = 0.6 + 0.25 * noise                      // 0.35..0.85
  const head  = Math.min(1, t / 0.06)
  const tail  = duration > 0 ? clamp01((duration - t) / 0.15) : 1
  return clamp01(base) * head * tail
}

// Синтезированные полосы по характеру источника, когда настоящего спектра
// нет: доли [низ, низ-середина, середина-верх, верх] от уровня + лёгкое
// независимое колебание каждой полосы, чтобы картинка жила
export const BAND_PROFILES = {
  voice:     [0.75, 0.9, 0.6, 0.35],   // речь: низ + середина, сверху «шипение»
  'ui-low':  [1, 0.7, 0.25, 0.1],
  'ui-mid':  [0.2, 0.5, 1, 0.6],
  'ui-high': [0.1, 0.25, 0.6, 1],
  'ui-all':  [1, 1, 1, 1],
}
const WOBBLE_HZ = [5.1, 7.7, 11.3, 17]
export function synthBands(level, t, profile = 'voice', out = new Float32Array(BANDS)) {
  const p = BAND_PROFILES[profile] ?? BAND_PROFILES.voice
  for (let k = 0; k < BANDS; k++) out[k] = clamp01(level * p[k] * (0.8 + 0.2 * Math.sin(t * WOBBLE_HZ[k] + k * 1.7)))
  return out
}

// { playing, getLevel(now) → 0..1, getBands?(now, out4) → true если заполнил, profile? }
export function publishLevel(id, { playing, getLevel, getBands = null, profile = 'voice' }) {
  if (!playing || typeof getLevel !== 'function') { unpublishLevel(id); return }
  sources.set(id, { getLevel, getBands: typeof getBands === 'function' ? getBands : null, profile, on: sources.get(id)?.on ?? false })
  start()
}

export function unpublishLevel(id) {
  if (!sources.delete(id)) return
  if (!sources.size) stop()
}

export function hasPlayingSources() { return sources.size > 0 }

// fn(level, active, now, bands): active=false приходит, когда свечения нет —
// цикл встал (источников не осталось / вкладка скрыта) либо все источники
// тихие (< порога) и хвост спада иссяк; подписчик гасит свет СРАЗУ. active=true
// приходит снова, когда какой-то источник вновь громче порога
export function subscribeAudioLevel(fn) {
  listeners.add(fn)
  hookVisibility()
  start()
  return () => {
    listeners.delete(fn)
    if (!listeners.size) stop()
  }
}

function shouldRun() { return sources.size > 0 && listeners.size > 0 && !env.hidden() }

function start() {
  if (running || !shouldRun()) return
  running = true
  lastFrameAt = -Infinity
  rafId = env.raf(tick)
}

function stop() {
  if (!running) return
  running = false
  env.caf(rafId)
  rafId = 0
  smoothed = 0
  shown = false
  bandsSm.fill(0)
  bands.fill(0)
  listeners.forEach(fn => fn(0, false, 0, bands))
}

function tick(now) {
  if (!shouldRun()) { stop(); return }
  rafId = env.raf(tick)
  // Не чаще LEVEL_FPS: на 60/120 Гц лишние кадры пропускаем
  if (now - lastFrameAt < FRAME_MS - 1) return
  lastFrameAt = now
  let max = 0
  frameMax.fill(0)
  for (const s of sources.values()) {
    const v = clamp01(s.getLevel(now))
    s.on = v >= (s.on ? MIN_LEVEL_OFF : MIN_LEVEL)   // гистерезис
    if (!s.on) continue                              // тихий источник — нулевой вклад
    if (v > max) max = v
    if (!(s.getBands && s.getBands(now, tmp))) synthBands(v, now / 1000, s.profile, tmp)
    for (let k = 0; k < BANDS; k++) { const b = clamp01(tmp[k]); if (b >= BAND_FLOOR && b > frameMax[k]) frameMax[k] = b }
  }
  smoothed += (max - smoothed) * (max > smoothed ? ATTACK : RELEASE)
  let live = false
  for (let k = 0; k < BANDS; k++) {
    bandsSm[k] += (frameMax[k] - bandsSm[k]) * (frameMax[k] > bandsSm[k] ? ATTACK : RELEASE)
    bands[k] = bandsSm[k] < BAND_FLOOR ? 0 : bandsSm[k]
    if (bands[k] > 0) live = true
  }
  if (!live) {
    // Все тихие и хвост спада иссяк: гасим один раз, цикл продолжает ждать
    smoothed = 0
    bandsSm.fill(0)
    if (shown) { shown = false; listeners.forEach(fn => fn(0, false, now, bands)) }
    return
  }
  shown = true
  listeners.forEach(fn => fn(smoothed, true, now, bands))
}

// Скрытая вкладка: цикл стоит (rAF там и так заморожен, но подписчика надо
// честно погасить); вернулись — продолжаем, если кто-то ещё играет
function hookVisibility() {
  if (visibilityHooked || typeof document === 'undefined') return
  visibilityHooked = true
  document.addEventListener('visibilitychange', () => { if (env.hidden()) stop(); else start() })
}

// Только для тестов: подмена rAF/видимости и полный сброс состояния
export function _audioLevelTestHooks(partial = null) {
  if (partial) env = { ...env, ...partial }
  return {
    reset() { sources.clear(); listeners.clear(); running = false; rafId = 0; smoothed = 0; shown = false; bandsSm.fill(0); bands.fill(0); lastFrameAt = -Infinity },
    isRunning: () => running,
  }
}
