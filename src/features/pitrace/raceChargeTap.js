// Тихий звук удара слова о бар в заставке «Гонки» (CONCEPT_RACE.md): короткий мягкий «тык» на каждое касание — синус 880 Гц, 40 мс, атака 5 мс, на 18 дБ тише нот отсчёта (COUNT_RMS), затухание к нулю.
// Играет тот же игровой AudioContext и тот же плеер (playGameBuffer), что ноты и взлёт: буфер синтезируется прямо в AudioBuffer ОДИН раз на частоту дискретизации, без файлов. Это ЗВУК, не графика — на слабом
// устройстве (lite) и при reduced-motion он тоже играет; «без звука» урока гасит. Нет Web Audio — тишина.
import { getLessonMuted } from '../player/lessonVolume.js'
import { webAudioOn, getGameCtx } from '../../shared/lib/gameAudioCtx.js'
import { playGameBuffer } from '../../shared/lib/gameBufferPlay.js'
import { COUNT_RMS, COUNT_PEAK } from '../rehearsal/rehearsalCountdownSynth.js'

export const TAP_HZ = 880
export const TAP_MS = 40
export const TAP_ATTACK_MS = 5
export const TAP_DB = -18 // относительно нот отсчёта
export const TAP_RMS = COUNT_RMS * 10 ** (TAP_DB / 20)

/** Отсчёты звука на частоте rate: Float32Array в −1…1, RMS = TAP_RMS, пик ≤ COUNT_PEAK */
export function synthTap(rate = 44100) {
  const len = Math.max(1, Math.floor((rate * TAP_MS) / 1000)), attack = Math.max(1, Math.floor((rate * TAP_ATTACK_MS) / 1000))
  const out = new Float32Array(len)
  let sumSq = 0
  for (let i = 0; i < len; i++) {
    out[i] = Math.sin((2 * Math.PI * TAP_HZ * i) / rate) * Math.min(1, i / attack) * (1 - i / len)
    sumSq += out[i] * out[i]
  }
  const rms = Math.sqrt(sumSq / len)
  let k = rms > 0 ? TAP_RMS / rms : 0
  const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0) * k
  if (peak > COUNT_PEAK) k *= COUNT_PEAK / peak
  for (let i = 0; i < len; i++) out[i] *= k
  return out
}

const cache = new Map() // частота дискретизации → AudioBuffer

/** AudioBuffer «тыка» для контекста ctx (создаётся один раз на частоту). null — не вышло */
export function tapBuffer(ctx) {
  const rate = ctx?.sampleRate || 44100
  if (cache.has(rate)) return cache.get(rate)
  try {
    const data = synthTap(rate), buf = ctx.createBuffer(1, data.length, rate)
    if (typeof buf.copyToChannel === 'function') buf.copyToChannel(data, 0); else buf.getChannelData(0).set(data)
    cache.set(rate, buf)
    return buf
  } catch { return null }
}

/** Игра закрыта: буфер отпускаем */
export const dropTapBuffer = () => cache.clear()

/** Сыграть «тык». false — «без звука» урока, нет Web Audio или буфера. play подставляется в тестах */
export function playChargeTap({ play = playGameBuffer } = {}) {
  if (getLessonMuted() || !webAudioOn()) return false
  const c = getGameCtx(), buf = c ? tapBuffer(c) : null
  return buf ? !!play(buf, { gain: 1 }) : false
}
