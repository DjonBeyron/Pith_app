// «Дубль и зеркало»: запись с телефона звучит тише голоса Пита (файлы библиотеки нормализованы, микрофон — нет), поэтому при воспроизведении дубль выравнивается по громкости — GainNode в playGameBuffer
// (у <audio> на iPhone volume не меняется, у Web Audio работает и может быть выше 1). Математика — та же, что у нормализации звуков игры (shared/lib/audioNormalize.js: «цель по RMS, потолок по пику»):
// множитель = цель / средний RMS голоса записи (voicedRms: только «голосовые» окна, тишина до и после фразы не занижает цифру), но не выше, чем пик записи после усиления упрётся в потолок — клиппинга нет.
// Цель — громкость файлов диктора (mirror.dictorRms, libraryRms.js): дубль звучит как голос Пита; нет цифры — TAKE_TARGET_RMS. Чистые функции над Float32Array / AudioBuffer, без DOM.
import { voicedRms } from './mirrorRms.js'
import { mixToMono, peakOf, SFX_PEAK_LIMIT } from '../../../shared/lib/audioNormalize.js'

export const TAKE_TARGET_RMS = 0.1   // средний RMS голоса, если громкость диктора неизвестна (≈ −20 dBFS: уверенная речь)
export const TARGET_MIN = 0.05       // цель из файлов диктора берётся не тише и не громче этих границ (мусорная цифра не должна оглушить или заглушить)
export const TARGET_MAX = 0.25
export const TAKE_PEAK_CEIL = SFX_PEAK_LIMIT // пик записи после усиления не выше (≈ 0.73 шкалы: запас от клиппинга)
export const TAKE_MAX_GAIN = 10      // усиление не больше +20 дБ: шум комнаты тоже растёт
export const TAKE_MIN_GAIN = 0.5     // и не тише вдвое: слишком громкую запись только слегка прижимаем

/** Множитель громкости записи: rms — средний RMS голоса (0..1), peak — пик (0..1), targetRms — цель или null. Нет голоса (rms ≈ 0) — 1 (играем как есть) */
export function takeGain({ rms, peak, targetRms = null }) {
  if (!(rms > 1e-4)) return 1
  const target = targetRms > 0 ? Math.min(TARGET_MAX, Math.max(TARGET_MIN, targetRms)) : TAKE_TARGET_RMS
  let gain = Math.min(TAKE_MAX_GAIN, target / rms)
  if (peak > 0 && peak * gain > TAKE_PEAK_CEIL) gain = TAKE_PEAK_CEIL / peak // потолок: не клиппит
  return Math.max(TAKE_MIN_GAIN, gain)
}

/** Множитель для AudioBuffer (каналы смешиваются в моно): нет данных — 1 */
export function bufferGain(buffer, targetRms = null) {
  try {
    const n = buffer?.numberOfChannels ?? 0
    if (!n || typeof buffer.getChannelData !== 'function') return 1
    const mono = mixToMono(Array.from({ length: n }, (_, c) => buffer.getChannelData(c)))
    return takeGain({ rms: voicedRms(mono, buffer.sampleRate || 44100), peak: peakOf(mono), targetRms })
  } catch { return 1 }
}
