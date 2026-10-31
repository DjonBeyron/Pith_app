// «Чувствительность микрофона» игры «Повтори за диктором»: ПРОГРАММНОЕ усиление голоса перед распознаванием Vosk — тихо сказанное слово всё равно слышно. Обработку системой (эхо/шум) НЕ трогаем: её включение даёт хрип
// (DEV_REHEARSAL.md §3.1), поэтому усиление делается в нашей цепочке Web Audio — источник потока → GainNode → мягкий ограничитель (DynamicsCompressor) → ScriptProcessor Vosk (shared/lib/vosk/voskGain.js).
// Усиленный сигнал видит всё, что считает по этому звуку: распознавание, ворота голоса, кольца уровня микрофона (wordLaneMicLevel.js) и пилюли. Запись дубля (MediaRecorder на потоке игры) идёт со звуком без усиления.
// Настройка в HUD ⚙ игры (WordLaneHud.jsx), хранится в localStorage (pithy_game_mic_gain_v1): 'normal' ×1 (цепочки нет) | 'high' ×2 (по умолчанию) | 'max' ×4. Применяется к следующему заходу распознавания (секунды).
// Системное автоусиление (autoGainControl в gameMic.GAME_MIC_CONSTRAINTS) оставлено как есть: iOS Safari его не всегда выполняет, поэтому программного усиления достаточно и без него.
export const MIC_GAIN_KEY = 'pithy_game_mic_gain_v1'
export const MIC_GAIN_LEVELS = [
  { id: 'normal', gain: 1, title: 'Обычная' },
  { id: 'high', gain: 2, title: 'Высокая ×2' },
  { id: 'max', gain: 4, title: 'Очень высокая ×4' },
]
export const DEFAULT_MIC_GAIN = 'high'

const byId = id => MIC_GAIN_LEVELS.find(l => l.id === id) ?? null

/** Выбранный уровень чувствительности ('normal' | 'high' | 'max'); нет записи / мусор — по умолчанию */
export function readMicGainId(store = globalThis.localStorage) {
  try { const v = store?.getItem(MIC_GAIN_KEY); return byId(v) ? v : DEFAULT_MIC_GAIN } catch { return DEFAULT_MIC_GAIN }
}
export function writeMicGainId(id, store = globalThis.localStorage) {
  if (!byId(id)) return
  try { if (id === DEFAULT_MIC_GAIN) store?.removeItem(MIC_GAIN_KEY); else store?.setItem(MIC_GAIN_KEY, id) } catch { /* приватный режим — живёт до перезагрузки */ }
}

/** Во сколько раз усиливаем звук микрофона (1, 2 или 4) */
export const readMicGain = (store = globalThis.localStorage) => byId(readMicGainId(store)).gain

/** Строка для журнала игры: «[mic] усиление ×2 (высокая) …» */
export const micGainLogLine = (store = globalThis.localStorage) => {
  const l = byId(readMicGainId(store))
  return `[mic] усиление ×${l.gain} (${l.title.toLowerCase()}${l.gain > 1 ? '; перед Vosk: GainNode + мягкий ограничитель' : '; цепочки нет'})`
}
