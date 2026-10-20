import { fallbackMs } from './linePlayback.js'
import { createMouthSync } from './mouthSync.js'
import { validTimings, syntheticTimings, timingsEnd } from './mouthRhythm.js'

// Озвучка реплики заранее записанным файлом (audioUrl — mp3 ElevenLabs из
// сборщика) через общий HTMLAudio (sceneAudioUnlock.js; не WebAudio: на iOS
// элемент, стартовавший в жесте, дальше играет сам). Рот — mouthSync.js по
// wordTimings реплики (нет/битые → синтетические по длительности файла, а без
// неё — по оценке текста). Надёжность:
//  · не началось за LOAD_TIMEOUT_MS, ошибка сети (MEDIA_ERR_NETWORK) → одна
//    повторная попытка (load + play), дальше onFail → вызывающий код уходит в
//    speechSynthesis/таймер для ЭТОЙ реплики; 404/декодер/NotAllowedError —
//    onFail сразу (повтор бессмыслен);
//  · ошибка ПОСЛЕ начала звука → onEnd (реплика считается сыгранной, диалог
//    идёт дальше, а не начинает её заново голосом синтеза);
//  · конец — по ended, плюс запасной таймер по длительности (audioMeta.durationMs
//    → последний wordTimings.end → audio.duration → оценка по тексту ×2),
//    делённой на playbackRate, чтобы не зависнуть на потерянном ended;
//  · cancel() снимает все обработчики и таймеры, закрывает рот и ставит паузу,
//    только если элемент всё ещё наш (новая реплика могла его перехватить);
//  · muted («без звука») и playbackRate + preservesPitch ставятся здесь, тайминги
//    рта идут по currentTime (медиа-время), пересчёт не нужен.
// Таймеры/rAF инъектируются для тестов; src — подмена ссылки (blob прогрева).

export const LOAD_TIMEOUT_MS = 7000
export const RETRY_DELAY_MS = 350
export const GUARD_MARGIN_MS = 1500
// Звук встал на буферизации (слабая сеть, файл тянется с R2 без blob прогрева) и не двигается столько — реплика считается сыгранной
export const STALL_LIMIT_MS = 20000
const MEDIA_ERR_NETWORK = 2

const owners = new WeakMap() // элемент → токен текущего владельца
let seq = 0

// Цепочка сегментов (audioChain.js) занимает те же элементы: новый владелец — новый токен, чужую паузу не ставим
export function claimAudio(elements) {
  const token = ++seq
  for (const el of elements) if (el) owners.set(el, token)
  return token
}
export const ownsAudio = (el, token) => owners.get(el) === token

export function clampRate(rate) {
  const r = Number(rate)
  return Number.isFinite(r) && r > 0 ? Math.min(4, Math.max(0.25, r)) : 1
}

// Длительность реплики в секундах из того, что известно до загрузки (или null)
export function knownDurationSec(line, timings) {
  const ms = line?.audioMeta?.durationMs
  if (Number.isFinite(ms) && ms > 0) return ms / 1000
  return timingsEnd(timings)
}

export function playLineAudio(line, audio, {
  src = null, muted = false, rate = 1, applyMouth = () => {}, lowPower = false,
  onEnd, onFail, onMode, timers = globalThis, raf, caf, now, isHidden,
} = {}) {
  if (!audio || !line?.audioUrl) { onFail?.(audio ? 'no-url' : 'no-element'); return () => {} }
  const token = ++seq
  owners.set(audio, token)
  const k = clampRate(rate)
  const text = line.text ?? ''
  const timings = validTimings(line.wordTimings) ? line.wordTimings : null
  let durationSec = knownDurationSec(line, timings)
  const synth = d => syntheticTimings(text, d ?? fallbackMs(text) / 1000)
  const sync = createMouthSync(audio, timings ?? synth(durationSec), applyMouth, { raf, caf, timers, now, isHidden, pollMs: lowPower ? 35 : 0 })

  let done = false
  let started = false
  let retried = false
  let loadTimer = null
  let guardTimer = null
  let retryTimer = null
  let stallTimer = null

  const on = (ev, fn) => audio.addEventListener(ev, fn)
  const off = (ev, fn) => audio.removeEventListener(ev, fn)

  function onPlaying() {
    if (done) return
    started = true
    timers.clearTimeout(loadTimer)
    sync.start()
    if (durationSec == null && Number.isFinite(audio.duration) && audio.duration > 0) durationSec = audio.duration
    timers.clearTimeout(stallTimer)
    armGuard()
  }
  // Запасной конец по МЕДИА-времени: сколько файлу осталось играть от текущей позиции (÷ скорость) + запас. Считается заново на каждом
  // 'playing' (после буферизации/перемотки) и старый таймер снимается — раньше первый таймер от «первого playing» жил дальше и на слабой
  // сети обрывал звук посреди реплики, пока файл ещё догружался, а сцена шла к следующей реплике
  function armGuard() {
    timers.clearTimeout(guardTimer)
    const baseMs = durationSec != null ? durationSec * 1000 : fallbackMs(text) * 2
    const pos = Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime * 1000) : 0
    guardTimer = timers.setTimeout(() => finish(false), Math.round(Math.max(0, baseMs - pos) / k) + GUARD_MARGIN_MS)
  }
  // Буферизация: часы запаса стоят (звука нет — ждать конца по часам нечестно), но вечно висеть тоже нельзя
  function onWaiting() {
    if (done || !started) return
    timers.clearTimeout(guardTimer)
    timers.clearTimeout(stallTimer)
    stallTimer = timers.setTimeout(() => finish(false), STALL_LIMIT_MS)
  }
  function onMeta() {
    if (done || timings || durationSec != null) return
    const d = audio.duration
    if (Number.isFinite(d) && d > 0) { durationSec = d; sync.setTimings(synth(d)) }
  }
  function onEnded() { finish(false) }
  function onError() {
    if (done) return
    if (started) { finish(false); return }
    const code = audio.error?.code
    if (!retried && (code == null || code === MEDIA_ERR_NETWORK)) retry()
    else finish(true, `media-error-${code ?? '?'}`)
  }
  function onLoadTimeout() {
    if (done || started) return
    if (!retried) retry()
    else finish(true, 'load-timeout')
  }

  function retry() {
    retried = true
    timers.clearTimeout(loadTimer)
    retryTimer = timers.setTimeout(() => {
      if (done) return
      try { audio.load() } catch { /* ignore */ }
      start()
    }, RETRY_DELAY_MS)
  }

  function start() {
    loadTimer = timers.setTimeout(onLoadTimeout, LOAD_TIMEOUT_MS)
    let p
    try {
      try { audio.currentTime = 0 } catch { /* до метаданных может бросить */ }
      p = audio.play()
    } catch { finish(true, 'play-threw'); return }
    if (p?.catch) {
      p.catch(e => {
        if (done || started) return
        if (e?.name === 'NotAllowedError') finish(true, 'not-allowed')
        else if (e?.name === 'NotSupportedError') finish(true, 'not-supported')
        else if (!retried) retry()
        else finish(true, `play-rejected-${e?.name ?? '?'}`)
      })
    }
  }

  function teardown() {
    done = true
    timers.clearTimeout(loadTimer); timers.clearTimeout(guardTimer); timers.clearTimeout(retryTimer); timers.clearTimeout(stallTimer)
    sync.stop()
    off('playing', onPlaying); off('waiting', onWaiting); off('ended', onEnded); off('error', onError); off('loadedmetadata', onMeta)
    if (owners.get(audio) === token) { try { audio.pause() } catch { /* ignore */ } }
  }
  // reason отказа (onFail): 'not-allowed' (нет жеста) | 'not-supported' (404/не аудио) |
  // 'media-error-<code>' | 'load-timeout' | 'play-threw' | 'play-rejected-<name>' | 'no-url' | 'no-element'
  function finish(fail, reason = 'unknown') {
    if (done) return
    teardown()
    if (fail) onFail?.(reason)
    else onEnd?.()
  }

  on('playing', onPlaying); on('waiting', onWaiting); on('ended', onEnded); on('error', onError); on('loadedmetadata', onMeta)
  try {
    audio.muted = !!muted
    audio.preservesPitch = true
    audio.webkitPreservesPitch = true
    audio.playbackRate = k
    const want = src || line.audioUrl
    if (audio.src !== want) audio.src = want
  } catch { /* ignore */ }
  onMode?.('audio')
  start()

  return () => { if (!done) teardown() }
}
