import { WAVEFORM_FPS } from '../../shared/lib/audioUtils.js'

// Общий «уровень речи» урока для свечения-эквалайзера снизу чата (AudioGlow.jsx).
// Чистое состояние без React: источники звука (голосовое, озвучка слова,
// диктор таблицы) регистрируют функцию getLevel(now) → 0..1 и снимают себя,
// когда замолкают; один общий rAF-цикл живёт ТОЛЬКО пока есть играющие
// источники и подписчик, не чаще 30 кадров/с, берёт максимум по источникам,
// сглаживает (быстрая атака, медленный спад) и отдаёт подписчику число.
//
// НЕ Web Audio (createMediaElementSource/AnalyserNode): на iOS это переводит
// вывод в категорию soloAmbient — звук уходит в разговорный динамик или
// молчит (см. sounds.js). Уровень берётся из ПРЕДРАСЧИТАННЫХ данных: у
// голосовых и диктанта есть waveformData (RMS по кадрам WAVEFORM_FPS), у
// коротких mp3 слов — синтезированная огибающая речи (speechEnvelope).
// Звуки интерфейса (sounds.js) сюда не публикуются — свечение только на речь.

export const LEVEL_FPS = 30
const FRAME_MS = 1000 / LEVEL_FPS
const ATTACK  = 0.55   // доля пути к новому уровню за кадр, когда он выше
const RELEASE = 0.14   // …и когда ниже — спад медленнее, чем всплеск

const sources   = new Map()   // id → { getLevel }
const listeners = new Set()   // fn(level 0..1, active, now)
let rafId = 0
let running = false
let lastFrameAt = -Infinity
let smoothed = 0
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

// Огибающая «речи» для источников без волны (короткий mp3 слова): плавный
// псевдошум 0.35..0.85 по времени, короткий вход, затухание на последних
// 0.15с, если длительность известна (у <audio> до метаданных она NaN)
export function speechEnvelope(t, duration = 0) {
  if (!(t >= 0)) return 0
  const noise = Math.sin(t * 9.3) * 0.6 + Math.sin(t * 23.7 + 1.1) * 0.25 + Math.sin(t * 3.1 + 2.3) * 0.15
  const base  = 0.6 + 0.25 * noise                      // 0.35..0.85
  const head  = Math.min(1, t / 0.06)
  const tail  = duration > 0 ? clamp01((duration - t) / 0.15) : 1
  return clamp01(base) * head * tail
}

export function publishLevel(id, { playing, getLevel }) {
  if (!playing || typeof getLevel !== 'function') { unpublishLevel(id); return }
  sources.set(id, { getLevel })
  start()
}

export function unpublishLevel(id) {
  if (!sources.delete(id)) return
  if (!sources.size) stop()
}

export function hasPlayingSources() { return sources.size > 0 }

// fn(level, active, now): active=false приходит один раз, когда цикл встал
// (источников не осталось / вкладка скрыта) — подписчик гасит свечение
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
  listeners.forEach(fn => fn(0, false, 0))
}

function tick(now) {
  if (!shouldRun()) { stop(); return }
  rafId = env.raf(tick)
  // Не чаще LEVEL_FPS: на 60/120 Гц лишние кадры пропускаем
  if (now - lastFrameAt < FRAME_MS - 1) return
  lastFrameAt = now
  let max = 0
  for (const s of sources.values()) {
    const v = clamp01(s.getLevel(now))
    if (v > max) max = v
  }
  smoothed += (max - smoothed) * (max > smoothed ? ATTACK : RELEASE)
  listeners.forEach(fn => fn(smoothed, true, now))
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
    reset() { sources.clear(); listeners.clear(); running = false; rafId = 0; smoothed = 0; lastFrameAt = -Infinity },
    isRunning: () => running,
  }
}
