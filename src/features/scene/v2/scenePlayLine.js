import { speakFallback, pickRuVoice, detectLang } from './linePlayback.js'
import { playLineAudio, clampRate } from './audioLine.js'
import { playSegmentChain } from './audioChain.js'
import { planSegmentChain } from './audioChainPlan.js'
import { createMouthDriver, setMouth } from './mouthDriver.js'
import { getSceneAudioElement, peekSceneSpareElement } from './sceneAudioUnlock.js'
import { sceneAudioCache, prefetchAllowed } from './sceneAudioCache.js'
import { audioPartOf } from './sceneVoice.js'
import { resolveVoiceFlags } from './sceneOptions.js'
import { describeAudioFail } from './sceneAudioFail.js'
import { sceneTrace, srcKind, shortText } from './sceneTrace.js'
import { envelopeLevels } from '../../../shared/lib/audioEnvelope.js'

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
//  · оригинал реплики-шаблона (segments, озвучка по частям): у всех озвучиваемых частей есть audioUrl (части админа
//    + слово из word_audio) → цепочка «часть → слово → часть» (audioChain.js: без склейки файлов, второй <audio>
//    заранее подгружает следующую часть, рот и тайминги — общие на всю цепочку); у любой части нет файла или цепочка
//    не завелась до начала звука → запасной синтез по ВСЕЙ строке text, язык по тексту (en-US для английского);
//  · перевод (voice.translation=true и у реплики есть translation): после оригинала
//    играет translationAudioUrl (рот закрыт — говорит «диктор»); файла нет → синтез
//    ru-RU, а без синтеза или без звука — перевод пропускается сразу (не висим);
//  · «без звука» глушит оба (muted у файла / таймер у синтеза), rate — оба;
//  · once (playOnce, «Ещё раз») — только оригинал со звуком, переводом не подсказываем;
//  · setPhase('original' | 'translation' | null) — что звучит сейчас (подсветка перевода
//    в облачке); cancel() гасит любой шаг, рот закрывается.
// «Живой Пит v2» (opts().animV2, только у говорящего-маскота — скин в characters; animFlags.js): рот отдаёт коды Rhubarb по буквам слов
// с гейтом по огибающей audioMeta.env (нет — только буквы), граница слова и начало реплики идут в getLook() — зрачки (pupilLook.js).
// Без React: опции читаются через opts() на старте каждой реплики. Тесты —
// scenePlayLine.test.js, scenePlayLineTranslation.test.js.

// Ссылка озвучки следующей реплики (с учётом loop) или null; у реплики-шаблона — первой её части
export function nextAudioUrl(timeline, index, loop) {
  return nextAudioUrls(timeline, index, loop)[0] ?? null
}

// Все ссылки следующей реплики: audioUrl либо файлы сегментов (реплика-шаблон целиком не озвучена)
export function nextAudioUrls(timeline, index, loop) {
  if (!timeline?.length) return []
  const n = index + 1 < timeline.length ? index + 1 : loop ? 0 : -1
  const l = n >= 0 ? timeline[n] : null
  if (!l) return []
  if (Array.isArray(l.segments)) return l.segments.map(s => s?.audioUrl).filter(u => typeof u === 'string' && u)
  return l.audioUrl ? [l.audioUrl] : []
}

// Запасная озвучка перевода: только живой синтез со звуком; иначе — сразу конец (без таймера)
export function speakTranslationFallback(text, voice, { sound = true, onEnd, onMode } = {}) {
  if (!sound || !pickRuVoice()) { onEnd?.(); return () => {} }
  return speakFallback(text, voice, { sound, onEnd, onMode })
}

// Файл не завёлся → запись в консоль (чтобы откат на синтез/таймер не был невидимым)
export function logAudioFallback(info) {
  console.warn(`[scene] озвучка файлом не завелась → ${describeAudioFail(info.reason, info.text)}`, info.url || info.text)
  sceneTrace(`реплика ${info.index} ${info.kind}: файл не завёлся (${info.reason}) → синтез/таймер; ${srcKind(info.src || info.url)}`)
}

// onFallback(info | null): null — реплика стартовала (сброс), иначе { url, reason, kind, index }
// onStarted(index, remainingMs) — файл оригинала реально зазвучал (audioLine.onStarted) с реальным остатком: режиссёр отдаёт это индикатору прогресса как «якорь»;
// onClock(index, remainingMs) — часы файла по timeupdate (перепривязка при расхождении)
export function makeScenePlayLine({
  scene, opts, getMouthEl, setMode, setPhase = () => {}, onFallback = null, onStarted = null, onClock = null,
  cache = sceneAudioCache, getAudio = getSceneAudioElement, allowed = prefetchAllowed,
  speak = speakFallback, speakTranslation = speakTranslationFallback, playAudio = playLineAudio, timers = globalThis,
  logFallback = logAudioFallback, playChain = playSegmentChain, getSpare = peekSceneSpareElement, getLook = () => null,
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
    const finish = () => { if (finished) return; finished = true; driver.stop(); getLook()?.lineEnd(); setPhase(null); onEnd() }
    // v2: рот кодами и зрачки — только у маскота; env берётся у самого комплекта озвучки (оригинал / перевод — у каждого свой)
    const v2On = !!o.animV2 && !!scene.characters?.[line.who]?.skin
    const v2Of = part => (v2On ? { lv: envelopeLevels(part.audioMeta?.env), onWord: () => getLook()?.word(line.who) } : null)
    if (v2On) getLook()?.lineStart(line.who)

    // Один комплект (оригинал или перевод) файлом с подкачкой, иначе — запасной вариант
    function playPart(kind, { sound, applyMouth, onDone, fallback }) {
      const part = audioPartOf(line, kind)
      if (!part.audioUrl) { fallback(); return }
      const audio = getAudio()
      const src = o.audioSrcOf?.(part.audioUrl) ?? cache.resolve(part.audioUrl) ?? null
      sceneTrace(`реплика ${index} ${kind} «${shortText(part.text ?? line.text)}»: файл ${src ? (o.audioSrcOf?.(part.audioUrl) ? 'из blob прогрева' : 'из кэша подкачки') : 'по ссылке'} ${srcKind(part.audioUrl)} sound=${sound}`)
      cache.pin(part.audioUrl)
      const slot = cancels.push(null) - 1 // место файла — перед запасным вариантом, даже если onFail пришёл синхронно
      cancels[slot] = playAudio(part, audio, {
        src, muted: !sound, rate: k, lowPower: !!o.lowPower, applyMouth, timers, v2: kind === 'original' ? v2Of(part) : null,
        onEnd: onDone, onMode: setMode, onStarted: kind === 'original' && onStarted ? ms => onStarted(index, ms) : undefined,
        onClock: kind === 'original' && onClock ? ms => onClock(index, ms) : undefined,
        onFail: reason => {
          const info = { url: part.audioUrl, src, reason: reason ?? 'unknown', kind, index }
          logFallback?.(info); onFallback?.(info)
          fallback()
        },
      })
    }
    const prefetch = url => { if (url && !o.audioSrcOf?.(url) && allowed()) cache.prefetch(url) }

    // Реплика-шаблон: цепочка частей, пока она годится, иначе (и при отказе до начала звука) — синтез всей строки
    function playSegments({ sound, onDone, fallback }) {
      const plan = planSegmentChain(line)
      if (!plan.ok) {
        const info = { url: '', text: plan.missing ?? '', src: null, reason: `segments-${plan.reason}`, kind: 'original', index }
        logFallback?.(info); onFallback?.(info)
        fallback()
        return
      }
      for (const p of plan.parts) { prefetch(p.audioUrl); cache.pin(p.audioUrl) }
      const srcOf = url => o.audioSrcOf?.(url) ?? cache.resolve(url) ?? null
      const slot = cancels.push(null) - 1
      cancels[slot] = playChain(plan, getAudio(), {
        spare: getSpare(), srcOf, muted: !sound, rate: k, lowPower: !!o.lowPower, applyMouth: apply, timers, v2: v2Of({}),
        onEnd: onDone, onMode: setMode,
        onFail: reason => {
          const info = { url: plan.parts[0].audioUrl, src: null, reason: reason ?? 'unknown', kind: 'original', index }
          logFallback?.(info); onFallback?.(info)
          fallback()
        },
      })
    }

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
    onFallback?.(null)
    for (const u of nextAudioUrls(timeline, index, loop)) prefetch(u)
    if (hasTr) prefetch(line.translationAudioUrl)
    const soundOriginal = o.sound && flags.original
    const speakOriginal = () => {
      driver.start()
      cancels.push(speak(line.text, voice, { sound: soundOriginal, lang: detectLang(line.text), onWord: () => { driver.onWord(); if (v2On) getLook()?.word(line.who) }, onEnd: afterOriginal, onMode: setMode }))
    }
    if (Array.isArray(line.segments) && line.segments.length) {
      playSegments({ sound: soundOriginal, onDone: afterOriginal, fallback: speakOriginal })
    } else {
      playPart('original', { sound: soundOriginal, applyMouth: apply, onDone: afterOriginal, fallback: speakOriginal })
    }

    // Отмена (пауза, уход со слайда, новая реплика): гасит текущий шаг, поздние onEnd шагов игнорируются
    return () => { finished = true; for (const c of cancels) c?.(); driver.stop(); apply('closed'); getLook()?.lineEnd(); setPhase(null) }
  }

  return { playLine, stop: () => driver.stop() }
}
