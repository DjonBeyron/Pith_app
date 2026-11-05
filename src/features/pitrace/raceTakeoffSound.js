// Звук взлёта принятой пилюли «Разгона» и «Слушай и лови» (CONCEPT_RACE.md): короткое приятное восходящее глиссандо двух нот ми → ля (E5 → A5), 180 мс, чистый синус с мягкой атакой и плавным затуханием, на 10 дБ тише нот отсчёта.
// Играет тот же игровой AudioContext и тот же плеер (playGameBuffer), что ноты награды и отсчёта: буфер синтезируется прямо в AudioBuffer ОДИН раз на частоту дискретизации (как noteBuffer отсчёта), без файлов и декодирования.
// Включается только у ступеней гонки (takeoffOn: win ступени-очереди sprint / catch); в репетиции и обычной игре его нет. Громкость — GainNode с фиксированной величиной (не зависит от ползунка награды), «без звука» урока гасит.
// Нет Web Audio — тишина (запасного <audio> нет: звук слишком короткий, а мяу награды играет и так).
import { getLessonMuted } from '../player/lessonVolume.js'
import { webAudioOn, getGameCtx } from '../../shared/lib/gameAudioCtx.js'
import { playGameBuffer } from '../../shared/lib/gameBufferPlay.js'
import { COUNT_RMS, COUNT_PEAK } from '../rehearsal/rehearsalCountdownSynth.js'

export const TAKEOFF_FROM_HZ = 659.25 // E5 (ми)
export const TAKEOFF_TO_HZ = 880      // A5 (ля)
export const TAKEOFF_MS = 180
export const TAKEOFF_DB = -10         // относительно нот отсчёта (COUNT_RMS)
export const TAKEOFF_RMS = COUNT_RMS * 10 ** (TAKEOFF_DB / 20) // ≈ 0,063
const GLIDE = 0.65                    // доля звука, за которую тон доезжает ми → ля (потом держится ля)
const ATTACK_S = 0.015                // мягкая атака
const TAIL = 1.6                      // затухание (1 − t)^1,6
const smooth = t => t * t * (3 - 2 * t)

/** Тон на доле звука t (0…1): плавный подъём ми → ля за GLIDE, дальше ровно ля */
export const takeoffHz = t => TAKEOFF_FROM_HZ + (TAKEOFF_TO_HZ - TAKEOFF_FROM_HZ) * smooth(Math.min(1, Math.max(0, t) / GLIDE))

/** Отсчёты звука на частоте rate: Float32Array в −1…1, RMS = TAKEOFF_RMS, пик ≤ COUNT_PEAK */
export function synthTakeoff(rate = 44100) {
  const len = Math.max(1, Math.floor((rate * TAKEOFF_MS) / 1000))
  const attack = Math.max(1, Math.floor(rate * ATTACK_S))
  const out = new Float32Array(len)
  let phase = 0, sumSq = 0
  for (let i = 0; i < len; i++) {
    phase += (2 * Math.PI * takeoffHz(i / len)) / rate // фаза копится: тон скользит без щелчков
    out[i] = Math.sin(phase) * Math.min(1, i / attack) * (1 - i / len) ** TAIL
    sumSq += out[i] * out[i]
  }
  const rms = Math.sqrt(sumSq / len)
  let k = rms > 0 ? TAKEOFF_RMS / rms : 0
  const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0) * k
  if (peak > COUNT_PEAK) k *= COUNT_PEAK / peak
  for (let i = 0; i < len; i++) out[i] *= k
  return out
}

const cache = new Map() // частота дискретизации → AudioBuffer

/** AudioBuffer звука для контекста ctx (создаётся один раз на частоту). null — не вышло */
export function takeoffBuffer(ctx) {
  const rate = ctx?.sampleRate || 44100
  if (cache.has(rate)) return cache.get(rate)
  try {
    const data = synthTakeoff(rate)
    const buf = ctx.createBuffer(1, data.length, rate)
    if (typeof buf.copyToChannel === 'function') buf.copyToChannel(data, 0); else buf.getChannelData(0).set(data)
    cache.set(rate, buf)
    return buf
  } catch { return null }
}

/** Игра закрыта: буфер отпускаем */
export const dropTakeoffBuffer = () => cache.clear()

/** Играть ли звук на реакцию движка: win ступени-очереди гонки («Разгон» и «Слушай и лови»); у многокусковых повторов — на последнем куске. Остальные ступени гонки и репетиция — нет */
export const takeoffOn = (stage, kind, info) => kind === 'win' && !!stage?.race && stage.type === 'student' && (stage.act === 'sprint' || stage.act === 'catch') && info?.last !== false

/** Сыграть звук взлёта. false — «без звука» урока, нет Web Audio или буфера. play подставляется в тестах */
export function playTakeoff({ play = playGameBuffer } = {}) {
  if (getLessonMuted() || !webAudioOn()) return false
  const c = getGameCtx()
  const buf = c ? takeoffBuffer(c) : null
  return buf ? !!play(buf, { gain: 1 }) : false
}
