// Режимы захвата звука для пробы «Голос» (эксперимент «чувствительность микрофона»). Чистые части: ограничения
// getUserMedia по режиму, RMS/пик по данным AnalyserNode, запоминание режима, формат журнала. Без React и window.
// Web Speech API не даёт управлять усилением — поэтому проверяем, помогает ли ПАРАЛЛЕЛЬНО открытый поток с AGC.

import { toPercent } from '../../../shared/lib/speech/speechPolicy.js'

export const CAPTURE_KEY = 'pithy_admin_voice_probe_mode_v1'
export const CAPTURE_MODES = ['plain', 'warm', 'warmns']
export const DEFAULT_CAPTURE = 'plain'
export const METER_MS = 100        // период опроса уровня
export const MAX_OPEN_MS = 60000   // страховка: поток живёт не дольше (попытка и так ≤ ~40 с)
export const FFT_SIZE = 256

export const CAPTURE_LABEL = { plain: 'Обычный', warm: 'Прогрев микрофона', warmns: 'Прогрев + шумоподавление' }
export const CAPTURE_SHORT = { plain: 'A', warm: 'B', warmns: 'C' }
export const CAPTURE_HINT = {
  plain: 'Только распознавание, как в модуле. Микрофон держит сам браузер, уровень не виден.',
  warm: 'Параллельно открываем микрофон с автоусилением (AGC), без шумо- и эхоподавления. Эксперимент.',
  warmns: 'То же, но с шумоподавлением и эхоподавлением — на случай, если мешает шум. Эксперимент.',
}
export const NO_LEVEL_HINT = 'Включи режим B, чтобы видеть уровень микрофона.'

export const isCaptureMode = m => CAPTURE_MODES.includes(m)
export const isWarmMode = m => m === 'warm' || m === 'warmns'

/** Ограничения для getUserMedia; null — потока не нужно (режим A) */
export function getCaptureConstraints(mode) {
  if (!isWarmMode(mode)) return null
  const ns = mode === 'warmns'
  return { audio: { autoGainControl: true, noiseSuppression: ns, echoCancellation: ns, channelCount: 1 } }
}

/** RMS 0..1 по байтам getByteTimeDomainData (тишина = 128). Пусто → 0 */
export function rmsFromBytes(bytes) {
  const n = bytes?.length || 0
  if (!n) return 0
  let sum = 0
  for (let i = 0; i < n; i++) { const v = (bytes[i] - 128) / 128; sum += v * v }
  return Math.min(1, Math.sqrt(sum / n))
}

/** Пик попытки: max из предыдущего пика и текущего уровня */
export const nextPeak = (peak, level) => (level > peak ? level : peak)

// toPercent живёт в общем speechPolicy.js (его же использует контроллер) — здесь реэкспорт для прежних импортов
export { toPercent }
export const fmtPercent = p => (typeof p === 'number' ? `${p}%` : '—')

export function readCaptureMode(store = globalThis.localStorage) {
  try {
    const m = store.getItem(CAPTURE_KEY)
    return isCaptureMode(m) ? m : DEFAULT_CAPTURE
  } catch { return DEFAULT_CAPTURE }
}

export function writeCaptureMode(mode, store = globalThis.localStorage) {
  try { store.setItem(CAPTURE_KEY, mode) } catch { /* приватный режим — режим живёт до перезагрузки */ }
}

/** Поля журнала по итогам потока попытки (info из менеджера или null): capture, peak %, capError, agc */
export function captureLogFields(mode, info) {
  const m = isCaptureMode(mode) ? mode : DEFAULT_CAPTURE
  if (!isWarmMode(m)) return { capture: m, peak: null, capError: null, agc: null }
  return { capture: m, peak: toPercent(info?.peak), capError: info?.error || null, agc: info?.agc ?? null }
}

/** «B · пик 12%» / «B · ошибка NotAllowedError» / «A» — для таблицы и отчёта (старые записи без поля → «A») */
export function fmtCapture(e) {
  const m = isCaptureMode(e?.capture) ? e.capture : DEFAULT_CAPTURE
  let s = CAPTURE_SHORT[m]
  if (!isWarmMode(m)) return s
  s += e.capError ? ` · ошибка ${e.capError}` : ` · пик ${fmtPercent(e.peak)}`
  if (e.agc === false) s += ' · AGC не включился'
  return s
}

export const fmtConf = c => (typeof c === 'number' ? `${c}%` : '—')
