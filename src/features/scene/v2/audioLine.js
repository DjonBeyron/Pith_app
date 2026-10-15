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
const MEDIA_ERR_NETWORK = 2

const owners = new WeakMap() // элемент → токен текущего владельца
let seq = 0

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

  const on = (ev, fn) => audio.addEventListener(ev, fn)
  const off = (ev, fn) => audio.removeEventListener(ev, fn)

  function onPlaying() {
    if (done) return
    started = true
    timers.clearTimeout(loadTimer)
    sync.start()
    if (durationSec == null && Number.isFinite(audio.duration) && audio.duration > 0) durationSec = audio.duration
    const baseMs = durationSec != null ? durationSec * 1000 : fallbackMs(text) * 2
    guardTimer = timers.setTimeout(() => finish(false), Math.round(baseMs / k) + GUARD_MARGIN_MS)
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
    timers.clearTimeout(loadTimer); timers.clearTimeout(guardTimer); timers.clearTimeout(retryTimer)
    sync.stop()
    off('playing', onPlaying); off('ended', onEnded); off('error', onError); off('loadedmetadata', onMeta)
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

  on('playing', onPlaying); on('ended', onEnded); on('error', onError); on('loadedmetadata', onMeta)
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
