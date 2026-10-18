import { wordKey } from './wordKey.js'

// Что озвучить, когда ответ верный (чекбоксы нод). Чистые функции: ключ библиотеки слов или null (тишина).
// Эти же правила использует collectLessonWords.js, чтобы нужная запись попала в библиотеку заранее.

/**
 * «Выбери слово»: верный вариант pickedOption. voiceCorrect: нет поля — включено, только если вариант английский
 * (у русского «Нам нужно уйти» озвучки в библиотеке нет); true/false — выбор автора. Русский вариант озвучивается
 * английской фразой из voicePhrase («We need to leave»).
 */
export function wordChoiceVoiceKey(wc, pickedOption) {
  if (!pickedOption?.isCorrect) return null
  const own = wordKey(pickedOption.text)
  const on = wc?.voiceCorrect ?? !!own
  if (!on) return null
  return own ?? wordKey(wc?.voicePhrase)
}

/** «Собери фразу»: voiceAnswer — нет поля = включено; false — молчим. Озвучивается собранная фраза целиком */
export function phraseAnswerVoiceKey(pa, words) {
  if (pa?.voiceAnswer === false) return null
  return wordKey((words ?? []).join(' '))
}
