import { speakFallback } from './linePlayback.js'
import { playLineAudio, clampRate } from './audioLine.js'
import { createMouthDriver, setMouth } from './mouthDriver.js'
import { getSceneAudioElement } from './sceneAudioUnlock.js'
import { sceneAudioCache, prefetchAllowed } from './sceneAudioCache.js'

// Один путь воспроизведения реплики для режиссёра (directorCore.playLine) —
// им идут и обычная игра, и playOnce («Ещё раз» в задании ленты), и нода урока:
//  · audioUrl есть → файл через общий <audio> (audioLine.js), src — blob
//    прогрева урока (audioSrcOf из usePlayerPreload) → blob кэша подкачки
//    (sceneAudioCache) → прямая ссылка; рот по wordTimings (mouthSync);
//    следующая реплика сцены подкачивается заранее (если нет blob урока и сеть
//    не в экономии);
//  · файла нет / не завёлся (onFail) → speechSynthesis или таймер
//    (linePlayback.js), рот — циклом по словам (mouthDriver);
//  · «без звука» → muted у файла / таймер у синтеза, ритм рта тот же;
//  · rate — множитель поверх voice.rate персонажа (синтез) и playbackRate (файл).
// Без React: опции читаются через opts() на старте каждой реплики. Тесты —
// scenePlayLine.test.js (инъекции cache/getAudio/allowed/speak/playAudio).

// Ссылка озвучки следующей реплики (с учётом loop) или null
export function nextAudioUrl(timeline, index, loop) {
  if (!timeline?.length) return null
  const n = index + 1 < timeline.length ? index + 1 : loop ? 0 : -1
  return n >= 0 ? timeline[n]?.audioUrl ?? null : null
}

export function makeScenePlayLine({
  scene, opts, getMouthEl, setMode,
  cache = sceneAudioCache, getAudio = getSceneAudioElement, allowed = prefetchAllowed,
  speak = speakFallback, playAudio = playLineAudio, timers,
}) {
  let who = null
  const apply = shape => setMouth(getMouthEl(who), shape)
  const driver = createMouthDriver(apply, timers)
  const timeline = scene.timeline ?? []
  const loop = !!scene.options?.loop

  function playLine(line, index, { onEnd }) {
    who = line.who
    const o = opts()
    const baseVoice = scene.characters?.[line.who]?.voice
    const k = clampRate(o.rate)
    const voice = { ...baseVoice, rate: Math.min(10, Math.max(0.1, (baseVoice?.rate ?? 1) * k)) }
    const end = () => { driver.stop(); onEnd() }
    let cancelAudio = null
    let cancelSpeech = null
    const fallback = () => {
      driver.start()
      cancelSpeech = speak(line.text, voice, { sound: o.sound, onWord: () => driver.onWord(), onEnd: end, onMode: setMode })
    }

    if (line.audioUrl) {
      const audio = getAudio()
      const src = o.audioSrcOf?.(line.audioUrl) ?? cache.resolve(line.audioUrl) ?? null
      cache.pin(line.audioUrl)
      const next = nextAudioUrl(timeline, index, loop)
      if (next && !o.audioSrcOf?.(next) && allowed()) cache.prefetch(next)
      cancelAudio = playAudio(line, audio, {
        src, muted: !o.sound, rate: k, lowPower: !!o.lowPower, applyMouth: apply, timers,
        onEnd, onMode: setMode, onFail: fallback,
      })
    } else fallback()

    return () => { cancelAudio?.(); cancelSpeech?.(); driver.stop() }
  }

  return { playLine, stop: () => driver.stop() }
}
