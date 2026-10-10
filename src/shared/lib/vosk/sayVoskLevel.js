// Уровень голоса для эквалайзера из громкости (RMS) кусков звука, которые движок Vosk получает с микрофона (voskEngine: cb.onLevel). Микрофон ОДИН — второго getUserMedia нет.
// Кусок приходит раз в 128 мс (2048 кадров при 16 кГц), а кольца читают уровень 60 раз в секунду, поэтому между кусками значение плавно оседает (за LEVEL_DECAY_MS до нуля),
// а новый громкий кусок поднимает его сразу. Формула RMS → 0..1 общая с реальным уровнем пробы (sayRealLevel.js: пол шума, усиление, корень). Чистый модуль, время подставляется.
import { levelFromRms } from '../speech/sayRealLevel.js'

export const LEVEL_DECAY_MS = 300

export function createRmsLevel({ now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) } = {}) {
  let level = 0
  let at = 0
  const decayed = t => (level <= 0 ? 0 : Math.max(0, level * (1 - Math.max(0, t - at) / LEVEL_DECAY_MS)))
  return {
    /** Пришёл кусок звука с громкостью rms (0..1) */
    push(rms, t = now()) { level = Math.max(levelFromRms(rms), decayed(t)); at = t },
    /** Уровень 0..1 на момент t (метка кадра rAF той же шкалы performance.now) */
    read(t = now()) { return decayed(t) },
    reset() { level = 0; at = 0 },
  }
}
