import { fallbackMs } from '../../../scene/v2/linePlayback.js'
import { clampRate, knownDurationSec } from '../../../scene/v2/audioLine.js'
import { planSegmentChain, chainLayout } from '../../../scene/v2/audioChainPlan.js'
import { audioPartOf } from '../../../scene/v2/sceneVoice.js'
import { resolveVoiceFlags } from '../../../scene/v2/sceneOptions.js'

// План длительностей реплик сцены для индикатора прогресса по ВРЕМЕНИ (кольцо кружка, полоса полного
// экрана) — чистая функция, повторяет то, что реально сыграет scenePlayLine.js на этой реплике:
//  · оригинал-файл: audioMeta.durationMs → конец последнего слова wordTimings → оценка по тексту
//    (audioLine.knownDurationSec), делённая на скорость речи урока (audio.playbackRate = rate);
//  · реплика-шаблон (segments) с озвученными частями — длина цепочки (audioChainPlan.chainLayout);
//  · нет файла — запасной вариант: таймер/синтез за fallbackMs(текст, скорость персонажа × rate), как timerSpeak;
//  · перевод (voice.translation): файл — так же по его audioMeta; файла нет — синтез за fallbackMs, а без
//    звука перевод пропускается сразу (speakTranslationFallback) — 0.
// Это ОЦЕНКА до начала реплики: фактический конец приходит от режиссёра, а sceneProgressModel.js подгоняет
// кольцо без скачков. Между репликами режиссёр пауз не делает (advance сразу); задержка старта ноды
// (startDelayMs) идёт ДО status 'playing' — кольцо в ней пустое, как у видео до запуска.

export const MIN_LINE_MS = 400

const clampSpeech = r => Math.min(10, Math.max(0.1, r))

function partMs(part, text, k) {
  const sec = knownDurationSec(part, part.wordTimings)
  return sec ? sec * 1000 / k : fallbackMs(text, k)
}

export function lineDurationMs(scene, line, { rate = 1, sound = true, voice = null, once = false } = {}) {
  if (!line) return MIN_LINE_MS
  const flags = once ? { original: true, translation: false } : resolveVoiceFlags(scene, voice)
  const k = clampRate(rate)
  const text = typeof line.text === 'string' ? line.text : ''
  const speechRate = clampSpeech((scene?.characters?.[line.who]?.voice?.rate ?? 1) * k)
  let ms
  if (Array.isArray(line.segments) && line.segments.length) {
    const plan = planSegmentChain(line)
    ms = plan.ok ? chainLayout(plan.parts).totalSec * 1000 / k : fallbackMs(text, speechRate)
  } else {
    const part = audioPartOf(line, 'original')
    ms = part.audioUrl ? partMs(part, text, k) : fallbackMs(text, speechRate)
  }
  const tr = typeof line.translation === 'string' ? line.translation.trim() : ''
  if (flags.translation && tr) {
    const part = audioPartOf(line, 'translation')
    ms += part.audioUrl ? partMs(part, tr, k) : (sound ? fallbackMs(tr, k) : 0)
  }
  return Math.max(MIN_LINE_MS, Math.round(ms))
}

// Якорь (useSceneDirectorV2.anchorMs): файл оригинала реплики index реально зазвучал, известен его остаток anchorMs (мс, по фактической
// скорости). Длительность этой реплики = остаток + план на перевод (если озвучен); остальные — по плану. Оценка (durationMs / rate)
// расходилась с реальностью (скорость не применилась, задержка старта) — и кольцо доезжало до края заранее
export function withAnchorDuration(durations, scene, index, anchorMs, opts = {}) {
  if (!Number.isFinite(anchorMs) || anchorMs < 0 || !durations[index]) return durations
  const line = scene?.timeline?.[index]
  const translationMs = Math.max(0, durations[index] - lineDurationMs(scene, line, { ...opts, once: true }))
  const out = durations.slice()
  out[index] = Math.max(MIN_LINE_MS, Math.round(anchorMs + translationMs))
  return out
}

// Длительности всех реплик сцены (мс) и их сумма
export function planSceneDurations(scene, opts = {}) {
  const tl = Array.isArray(scene?.timeline) ? scene.timeline : []
  const durations = tl.map(l => lineDurationMs(scene, l, opts))
  return { durations, totalMs: durations.reduce((a, b) => a + b, 0) }
}
