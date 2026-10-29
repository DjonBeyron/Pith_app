// Уровень голоса для эквалайзера из громкости (RMS) кусков звука, которые движок Vosk получает с микрофона (voskEngine: cb.onLevel). Микрофон ОДИН — второго getUserMedia нет.
// Кусок приходит раз в 128 мс (2048 кадров при 16 кГц), а кольца читают уровень 60 раз в секунду, поэтому между кусками значение плавно оседает (за LEVEL_DECAY_MS до нуля),
// а новый громкий кусок поднимает его сразу. Формула RMS → 0..1 по умолчанию общая с реальным уровнем пробы (sayRealLevel.js: пол шума, усиление, корень). Чистый модуль, время подставляется.
// Спад настраивается: createRmsLevel({ decayMs }) либо свойство fromRms.decayMs (так формула игры «Повтори за диктором» несёт своё время спада — 120 мс, куски у неё по 23 мс).
// Без явного decayMs всё как у «Сказать фразу»: LEVEL_DECAY_MS, и каждый кусок пересчитывает спад от текущего значения (при кусках по 128 мс это почти линейно). При явном decayMs спад идёт ЛИНЕЙНО ОТ ПИКА:
// тихие куски его не перезапускают, иначе при кусках по 23 мс спад вышел бы экспонентой (хвост вдвое длиннее задуманного).
import { levelFromRms } from '../speech/sayRealLevel.js'

export const LEVEL_DECAY_MS = 300

export function createRmsLevel({ now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()), fromRms = levelFromRms, decayMs = fromRms.decayMs } = {}) {
  let level = 0
  let at = 0
  const fromPeak = decayMs != null
  const span = Math.max(1, Number(decayMs ?? LEVEL_DECAY_MS) || LEVEL_DECAY_MS)
  const decayed = t => (level <= 0 ? 0 : Math.max(0, level * (1 - Math.max(0, t - at) / span)))
  return {
    /** Пришёл кусок звука с громкостью rms (0..1) */
    push(rms, t = now()) {
      const v = fromRms(rms)
      const cur = decayed(t)
      if (fromPeak && !(v > cur)) return // тише оседающего пика — пик и его время не трогаем
      level = Math.max(v, cur); at = t
    },
    /** Уровень 0..1 на момент t (метка кадра rAF той же шкалы performance.now) */
    read(t = now()) { return decayed(t) },
    reset() { level = 0; at = 0 },
  }
}
