// Числа клипа «Записи набора» (v3.3.188, CONCEPT_VOICESET.md) — меряются на ИСХОДНОМ звуке (частота контекста, до передискретизации), чтобы при прогоне сверить уровни.
// У каждого куска звука (2048 кадров, как у слушателя слов) две громкости, обе — voskEngine.bufferRms:
//  • rms — сырой поток микрофона (то, что лежит в WAV);
//  • game — тот же кусок после «Чувствительности микрофона» игры (gameMicGain: GainNode ×2 + ограничитель, voskGain.js) — ЭТО видит движок: счётчик голоса, затвор, правило слова.
// Счётчик «голос / тишина» — тот же voskVoice.js, что у слушателя, на громкости game; идёт непрерывно (и в паузах между клипами: шум оценён заранее, как в игре). Часы — по длине кусков.
// Чистый модуль.
import { createEarVoice } from '../../../shared/lib/vosk/voskVoice.js'

export const LATE_MS = 300 // голос звучал в последние столько мс окна — слово могло не уместиться
const r5 = v => Math.round(v * 1e5) / 1e5

export function createChunkMeter() {
  let clock = 0
  const voice = createEarVoice({ now: () => clock })
  return {
    /** Кусок: сырой rms, rms после усиления игры, длина мс → запись куска { rms, game, ms, voice, noise } */
    push(rms, game, ms) {
      clock += ms
      const v = voice.push(game).voice
      return { rms, game, ms, voice: v, noise: voice.noise() }
    },
    noise: () => voice.noise(),
  }
}

/**
 * Числа клипа из записей кусков (предзапись входит): { ms, rmsPeak, rmsNoise (среднее самых тихих 10 % кусков), gamePeak, gameNoise (оценка счётчика перед окном), voiceMs, voiceOnMs, voiceOffMs
 * (мс от начала клипа; null — голоса не было), zeros (кусков с ровным нулём), zeroRunMs (самая длинная полоса ровного нуля подряд — оглохший поток), noVoice, late (голос в последние LATE_MS), early (клип начался с голоса) }
 */
export function clipStats(chunks, { preMs = 0 } = {}) {
  const ms = chunks.reduce((s, c) => s + c.ms, 0), live = chunks.filter(c => c.rms > 0).map(c => c.rms).sort((a, b) => a - b)
  const low = live.slice(0, Math.max(1, Math.round(live.length * 0.1)))
  let t = 0, voiceMs = 0, on = null, off = null, pre = null, run = 0, zeroRun = 0
  for (const c of chunks) {
    if (pre == null && t + c.ms > preMs) pre = c.noise
    if (c.voice) { voiceMs += c.ms; on ??= t; off = t + c.ms }
    run = c.rms === 0 ? run + c.ms : 0; zeroRun = Math.max(zeroRun, run)
    t += c.ms
  }
  return {
    ms: Math.round(ms), rmsPeak: r5(Math.max(0, ...chunks.map(c => c.rms))), rmsNoise: r5(low.length ? low.reduce((s, v) => s + v, 0) / low.length : 0),
    gamePeak: r5(Math.max(0, ...chunks.map(c => c.game))), gameNoise: r5(pre ?? chunks.at(-1)?.noise ?? 0),
    voiceMs: Math.round(voiceMs), voiceOnMs: on == null ? null : Math.round(on), voiceOffMs: off == null ? null : Math.round(off),
    zeros: chunks.filter(c => c.rms === 0).length, zeroRunMs: Math.round(zeroRun), noVoice: voiceMs === 0, late: off != null && off > ms - LATE_MS, early: on === 0,
  }
}
