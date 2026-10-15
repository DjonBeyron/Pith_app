import { speakFallback, pickRuVoice } from './linePlayback.js'
import { playLineAudio, clampRate } from './audioLine.js'
import { createMouthDriver, setMouth } from './mouthDriver.js'
import { getSceneAudioElement } from './sceneAudioUnlock.js'
import { sceneAudioCache, prefetchAllowed } from './sceneAudioCache.js'
import { audioPartOf } from './sceneVoice.js'
import { resolveVoiceFlags } from './sceneOptions.js'

// Один путь воспроизведения реплики для режиссёра (directorCore.playLine) —
// им идут и обычная игра, и playOnce («Ещё раз» в задании ленты), и нода урока.
// Реплика = последовательность «оригинал → перевод» по флагам озвучки
// (sceneOptions.resolveVoiceFlags: options.voice сцены ⊕ переопределение opts().voice):
//  · оригинал: audioUrl есть → файл через общий <audio> (audioLine.js), src — blob
//    прогрева урока (audioSrcOf) → blob кэша подкачки (sceneAudioCache) → ссылка;
//    рот по wordTimings (mouthSync); файла нет / не завёлся (onFail) → speechSynthesis
//    или таймер (linePlayback.js), рот циклом по словам (mouthDriver);
//    voice.original=false → то же, но без звука (muted/таймер): рот двигается,
//    реплика длится как обычно;
//  · перевод (voice.translation=true и у реплики есть translation): после оригинала
//    играет translationAudioUrl (рот закрыт — говорит «диктор»); файла нет → синтез
//    ru-RU, а без синтеза или без звука — перевод пропускается сразу (не висим);
//  · «без звука» глушит оба (muted у файла / таймер у синтеза), rate — оба;
//  · once (playOnce, «Ещё раз») — только оригинал со звуком, переводом не подсказываем;
//  · setPhase('original' | 'translation' | null) — что звучит сейчас (подсветка перевода
//    в облачке); cancel() гасит любой шаг, рот закрывается.
// Без React: опции читаются через opts() на старте каждой реплики. Тесты —
// scenePlayLine.test.js, scenePlayLineTranslation.test.js.

// Ссылка озвучки следующей реплики (с учётом loop) или null
export function nextAudioUrl(timeline, index, loop) {
  if (!timeline?.length) return null
  const n = index + 1 < timeline.length ? index + 1 : loop ? 0 : -1
  return n >= 0 ? timeline[n]?.audioUrl ?? null : null
}

// Запасная озвучка перевода: только живой синтез со звуком; иначе — сразу конец (без таймера)
export function speakTranslationFallback(text, voice, { sound = true, onEnd, onMode } = {}) {
  if (!sound || !pickRuVoice()) { onEnd?.(); return () => {} }
  return speakFallback(text, voice, { sound, onEnd, onMode })
}

export function makeScenePlayLine({
  scene, opts, getMouthEl, setMode, setPhase = () => {},
  cache = sceneAudioCache, getAudio = getSceneAudioElement, allowed = prefetchAllowed,
  speak = speakFallback, speakTranslation = speakTranslationFallback, playAudio = playLineAudio, timers = globalThis,
}) {
  let who = null
  const apply = shape => setMouth(getMouthEl(who), shape)
  const driver = createMouthDriver(apply, timers)
  const timeline = scene.timeline ?? []
  const loop = !!scene.options?.loop

  function playLine(line, index, { onEnd, once = false }) {
    who = line.who
    const o = opts()
    const flags = once ? { original: true, translation: false } : resolveVoiceFlags(scene, o.voice)
    const hasTr = flags.translation && typeof line.translation === 'string' && !!line.translation.trim()
    const baseVoice = scene.characters?.[line.who]?.voice
    const k = clampRate(o.rate)
    const voice = { ...baseVoice, rate: Math.min(10, Math.max(0.1, (baseVoice?.rate ?? 1) * k)) }
    const cancels = []
    let finished = false
    const finish = () => { if (finished) return; finished = true; driver.stop(); setPhase(null); onEnd() }

    // Один комплект (оригинал или перевод) файлом с подкачкой, иначе — запасной вариант
    function playPart(kind, { sound, applyMouth, onDone, fallback }) {
      const part = audioPartOf(line, kind)
      if (!part.audioUrl) { fallback(); return }
      const audio = getAudio()
      const src = o.audioSrcOf?.(part.audioUrl) ?? cache.resolve(part.audioUrl) ?? null
      cache.pin(part.audioUrl)
      const slot = cancels.push(null) - 1 // место файла — перед запасным вариантом, даже если onFail пришёл синхронно
      cancels[slot] = playAudio(part, audio, {
        src, muted: !sound, rate: k, lowPower: !!o.lowPower, applyMouth, timers,
        onEnd: onDone, onMode: setMode, onFail: fallback,
      })
    }
    const prefetch = url => { if (url && !o.audioSrcOf?.(url) && allowed()) cache.prefetch(url) }

    function playTranslation() {
      driver.stop(); apply('closed') // рот закрыт — говорит «диктор»
      setPhase('translation')
      const text = line.translation.trim()
      playPart('translation', {
        sound: o.sound, applyMouth: () => {}, onDone: finish,
        fallback: () => { cancels.push(speakTranslation(text, { pitch: 1, rate: k }, { sound: o.sound, onEnd: finish, onMode: setMode })) },
      })
    }
    const afterOriginal = () => { if (finished) return; driver.stop(); if (hasTr) playTranslation(); else finish() }

    setPhase('original')
    prefetch(nextAudioUrl(timeline, index, loop))
    if (hasTr) prefetch(line.translationAudioUrl)
    const soundOriginal = o.sound && flags.original
    playPart('original', {
      sound: soundOriginal, applyMouth: apply, onDone: afterOriginal,
      fallback: () => {
        driver.start()
        cancels.push(speak(line.text, voice, { sound: soundOriginal, onWord: () => driver.onWord(), onEnd: afterOriginal, onMode: setMode }))
      },
    })

    // Отмена (пауза, уход со слайда, новая реплика): гасит текущий шаг, поздние onEnd шагов игнорируются
    return () => { finished = true; for (const c of cancels) c?.(); driver.stop(); apply('closed'); setPhase(null) }
  }

  return { playLine, stop: () => driver.stop() }
}
