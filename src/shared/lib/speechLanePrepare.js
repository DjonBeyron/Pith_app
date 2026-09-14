import { FLIGHT_S, layerShots, freeLane, autoLayoutCoach } from './speechLaneTiming.js'
import { defaultAudioClips, audioClipsEnd } from './audioClips.js'

// Партитура тренажёра из данных ноды «Переверни телефон» — плеер играет
// ВСЕГДА, даже если автор не открывал «🎤 Тренажёр». Откуда берём, по порядку:
//   1. таймлайн с вылетами — как смонтировано;
//   2. слои без вылетов + тайминги озвучки — вылеты диктора по озвучке (Д9);
//   3. нет слоёв, есть сценарий (script) — слои из сценария: каждая фраза →
//      слой диктора + слой ученика; при озвучке диктор ложится по таймингам,
//      без озвучки — по очереди, слово горит у круга;
//   4. нет и сценария — встроенная демо-фраза, чтобы карточка не была пустой.
// Так нода в любом состоянии — мини-игра, а не «просто карточка».

export const DEMO_SCRIPT = 'I. I. I. Try. Try. Try. I try. I try. I try.'
// Пауза между вылетами одного слова и между группами при раскладке «по очереди»
const STEP_S = 1.6
const GROUP_GAP_S = 0.6
const LEAD_S = 0.5

// «I. I. I. Try, try, try. I try!» → [{text:'I', n:3}, {text:'try', n:3}, {text:'I try', n:1}]
// Подряд идущие одинаковые фразы — одна группа с числом повторов
export function parseScript(script) {
  const groups = []
  const parts = (script ?? '').split(/[.,!?;:\n]+/).map(p => p.trim()).filter(Boolean)
  for (const p of parts) {
    const last = groups[groups.length - 1]
    if (last && last.text.toLowerCase() === p.toLowerCase()) last.n += 1
    else groups.push({ text: p, n: 1 })
  }
  return groups
}

// Слои из сценария: на каждую группу — диктор и ученик, без клипов (их даст
// раскладка ниже). id устойчивые — по номеру группы
export function layersFromScript(script) {
  return parseScript(script).flatMap((g, i) => [
    { id: `s${i}-coach`, text: g.text, translation: '', role: 'coach', lane: 0, clips: [], repeats: [], visible: true, n: g.n },
    { id: `s${i}-user`,  text: g.text, translation: '', role: 'user',  lane: 0, clips: [], repeats: [], visible: true, n: g.n },
  ])
}

function shotsFrom(start, n) {
  return Array.from({ length: n }, (_, k) => ({ start: start + k * STEP_S, end: start + k * STEP_S + FLIGHT_S }))
}

function setShots(layer, shots, all) {
  layer.clips = shots.length ? [shots[0]] : []
  layer.repeats = shots.slice(1)
  layer.lane = shots.length ? freeLane(all, shots[0], layer.id) : 0
}

// Раскладка «по очереди»: слои без вылетов получают их друг за другом —
// диктор n раз, следом ученик столько же. Слои, у которых вылеты уже есть
// (например, диктор по озвучке), не трогаем: ученик встаёт после них
export function layoutSequential(layers) {
  const out = layers.map(l => ({ ...l }))
  let cursor = LEAD_S
  for (const l of out) {
    const have = layerShots(l)
    if (have.length) { cursor = Math.max(cursor, have[have.length - 1].end + GROUP_GAP_S); continue }
    const n = l.n ?? 1
    const shots = shotsFrom(cursor, n)
    setShots(l, shots, out)
    cursor = shots[shots.length - 1].end + GROUP_GAP_S
  }
  return out
}

// Диктор по озвучке (autoLayoutCoach), ученик — сразу после своего диктора.
// Пара диктор/ученик узнаётся по тексту слоя
function layoutAfterCoach(layers, wordTimings, audioClips, timelineLen) {
  const out = autoLayoutCoach(layers, wordTimings, audioClips, timelineLen)
  for (const l of out) {
    if (l.role !== 'user' || layerShots(l).length) continue
    const coach = out.find(c => c.role !== 'user' && c.text.toLowerCase() === l.text.toLowerCase() && layerShots(c).length)
    if (!coach) continue
    const shots = layerShots(coach)
    setShots(l, shotsFrom(shots[shots.length - 1].end + GROUP_GAP_S, shots.length), out)
  }
  return out
}

function endOf(layers) {
  return layers.reduce((m, l) => layerShots(l).reduce((mm, s) => Math.max(mm, s.end), m), 0)
}

// → { layers, audioClips, timelineLen, source } — source для лога: откуда партитура
export function prepareSpeechLane(tData) {
  const t = tData ?? {}
  const audioClips = t.audioClips?.length ? t.audioClips : defaultAudioClips(t.duration)
  const hasTimings = !!t.wordTimings?.length
  let layers = (t.timeline?.layers ?? []).filter(l => l.visible !== false && (l.text ?? '').trim())
  let source = 'таймлайн'

  if (!layers.length) {
    const script = (t.script ?? '').trim()
    layers = layersFromScript(script || DEMO_SCRIPT)
    source = script ? 'сценарий' : 'демо-фраза'
  }
  if (!layers.some(l => layerShots(l).length)) {
    const len = t.timelineLen ?? Math.max(audioClipsEnd(audioClips) + FLIGHT_S, 5)
    layers = hasTimings ? layoutAfterCoach(layers, t.wordTimings, audioClips, len) : layers
    layers = layoutSequential(layers)
    if (source === 'таймлайн') source = hasTimings ? 'слои по озвучке' : 'слои по очереди'
  }
  const timelineLen = Math.max(t.timelineLen ?? 0, endOf(layers), audioClipsEnd(audioClips))
  return { layers, audioClips, timelineLen, source }
}

// Обратный путь: сценарий диктора из дорожек. Автор сначала расставил слова
// на таймлайне, потом хочет озвучить именно их — берём все вылеты слоёв
// диктора И перевода в порядке времени (каждый вылет — одно произнесение) и
// склеиваем в предложения: «I. I. я. Try. Try. I try. я пытаюсь.» — диктор
// проговаривает и перевод. Слова parseScript прочитает обратно, а «🪄
// Смонтировать» разложит по озвучке; ученик в сценарий не идёт — его очередь
// это тишина
export function scriptFromLayers(layers) {
  const shots = []
  for (const l of layers ?? []) {
    if ((l.role ?? 'coach') === 'user' || l.visible === false) continue
    const text = (l.text ?? '').trim().replace(/[.!?,;:]+$/, '')
    if (!text) continue
    for (const s of layerShots(l)) shots.push({ t: s.start, text })
  }
  shots.sort((a, b) => a.t - b.t)
  return shots.map(s => `${s.text}.`).join(' ')
}
