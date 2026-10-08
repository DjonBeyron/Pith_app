// Громкость звуков интерфейса (sounds.js) — модульное состояние + поддержка
// регулировки на устройстве. Значения приходят из audioSettings.js (глобальная
// настройка админа). Нет ключа = 1 (звук как есть).
//
// iOS: громкость <audio> там программно НЕ регулируется (volume игнорируется).
// Выход — Web Audio (AudioBufferSource → GainNode): он управляется громкостью,
// но на iPhone по умолчанию играет в категории soloAmbient (может молчать при
// беззвучном режиме), поэтому при первом использовании ставим
// navigator.audioSession.type = 'playback' (Safari 16.4+). Без этого API на
// iOS громкость не регулируется вовсе — админ видит пометку (volumeUnsupported).
// Звук с громкостью 1 идёт старым путём <audio>, ничего не меняется.
//
// Громкость бывает и ВЫШЕ 1 (усиление, до VOLUME_MAX): часть звуков записана
// очень тихо (typing-*, xp-gain), и админ должен слышать их, настраивая. <audio>.volume
// выше 1.0 не бывает, поэтому усиление — только Web Audio (GainNode.gain > 1): на
// десктопе/Android оно доступно всегда, на iPhone — как и понижение, при
// Audio Session API (canBoostPlay). Нет такого пути — звук играет как при 1.

export const VOLUME_MAX = 3
const volumes = {}            // name → 0..VOLUME_MAX, кроме 1 (1 = нет ключа)
const subs = new Set()

const clampVol = v => (v > VOLUME_MAX ? VOLUME_MAX : v < 0 ? 0 : v)

export function getSoundVolume(name) {
  const v = volumes[name]
  return typeof v === 'number' ? v : 1
}

// map целиком заменяет состояние: { name: 0..VOLUME_MAX }; нечисловое и ровно 1
// отбрасывается, остальное зажимается в 0..VOLUME_MAX
export function setSoundVolumes(map) {
  for (const k of Object.keys(volumes)) delete volumes[k]
  for (const [k, v] of Object.entries(map ?? {})) {
    if (typeof v === 'number' && Number.isFinite(v) && v !== 1) volumes[k] = clampVol(v)
  }
  subs.forEach(fn => fn())
}

export function onSoundVolumeChange(fn) {
  subs.add(fn)
  return () => { subs.delete(fn) }
}

const nav = () => (typeof navigator !== 'undefined' ? navigator : null)

export function isIos() {
  const n = nav()
  if (!n) return false
  return /iP(hone|ad|od)/.test(n.userAgent || '') || (n.platform === 'MacIntel' && n.maxTouchPoints > 1)
}

// Можно играть через Web Audio с громкостью (Audio Session API есть)
export const canGainPlay = () => !!nav()?.audioSession

// iPhone без Audio Session API: громкость < 1 не применится
export const volumeUnsupported = () => isIos() && !canGainPlay()

// Усиление (> 1) возможно: Web Audio есть везде, кроме iPhone без Audio Session API
// (там он играет в soloAmbient и молчит при беззвучном режиме)
export const canBoostPlay = () => !isIos() || canGainPlay()

// Нужен ли звуку с такой громкостью путь Web Audio: понижение — только где <audio>.volume
// не работает (iOS с Audio Session API), усиление — везде, где Web Audio допустим
export const needsGain = volume => (volume > 1 ? canBoostPlay() : volume < 1 && canGainPlay())

let sessionSet = false
function setPlaybackSession() {
  if (sessionSet) return
  sessionSet = true
  try { nav().audioSession.type = 'playback' } catch { /* API нет или запрещён — играем как есть */ }
}

const buffers = new Map()     // name → Promise<AudioBuffer>; источники пересоздаются на каждый play

// Декодируем mp3 один раз на общем ctx и держим в кэше (Promise — чтобы
// параллельные запросы не декодировали дважды). Ошибка из кэша убирается
export function loadGainBuffer(ctx, name, url) {
  let p = buffers.get(name)
  if (!p) {
    p = fetch(url, { cache: 'force-cache' })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer() })
      .then(ab => ctx.decodeAudioData(ab))
      .catch(e => { buffers.delete(name); throw e })
    buffers.set(name, p)
  }
  return p
}

async function ensureRunning(ctx) {
  if (ctx.state === 'running') return
  await Promise.race([ctx.resume().catch(() => {}), new Promise(r => setTimeout(r, 300))])
  if (ctx.state !== 'running') throw new Error(`AudioContext не запущен (${ctx.state})`)
}

// AudioBufferSource → GainNode(gain = volume) → destination. Возвращает
// длительность звука (сек). Бросает, если ctx не запустился — звать HTMLAudio
export async function playWithGain(ctx, name, url, volume) {
  setPlaybackSession()
  const buffer = await loadGainBuffer(ctx, name, url)
  await ensureRunning(ctx)
  const source = ctx.createBufferSource()
  source.buffer = buffer
  const gain = ctx.createGain()
  gain.gain.value = volume
  source.connect(gain)
  gain.connect(ctx.destination)
  source.start(0)
  return buffer.duration
}
