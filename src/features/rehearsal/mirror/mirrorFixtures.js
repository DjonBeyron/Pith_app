// «Дубль и зеркало»: готовые данные для тестов, демо-блока и проверки в браузере (подставные: так выглядит дубль без микрофона и Vosk).
// Диктор — в мс (как dictorWordsFromChunks), человек — в секундах от старта записи (как Vosk stats.words).
export const CHUNKS = ["I'm", 'trying', 'to learn']

export const DICTOR = {
  words: [
    { word: "i'm", start: 0, end: 300 }, { word: 'trying', start: 380, end: 900 },
    { word: 'to', start: 980, end: 1100 }, { word: 'learn', start: 1100, end: 1600 },
  ],
  durationMs: 1600,
  rms: 0.1,
}

const w = (word, start, end) => ({ word, conf: 1, start, end })
/** Чистый дубль: те же длины, что у диктора, реакция 0,4 с до первого слова */
export const STUDENT_CLEAN = { words: [w("i'm", 0.4, 0.7), w('trying', 0.78, 1.3), w('to', 1.38, 1.5), w('learn', 1.5, 2.0)], durationMs: 2600, rms: 0.09 }
/** Пропущено «trying» */
export const STUDENT_MISSING = { words: [w("i'm", 0.4, 0.7), w('to', 0.8, 0.92), w('learn', 0.92, 1.42)], durationMs: 2200, rms: 0.09 }
/** Долгая пауза (1,1 с) перед «to learn» */
export const STUDENT_PAUSE = { words: [w("i'm", 0.4, 0.7), w('trying', 0.78, 1.3), w('to', 2.4, 2.52), w('learn', 2.52, 3.02)], durationMs: 3600, rms: 0.09 }
