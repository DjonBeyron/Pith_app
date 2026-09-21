import { makeGlobalBoolSetting } from './globalBoolSetting.js'

// Озвучка верного ответа в «Выбери слово» — глобальный тумблер админки
// (app_settings.word_choice_voice). По умолчанию ВЫКЛЮЧЕНО: в этом модуле
// тап = ответ, и слово накладывалось на звук answer-correct — пока решено
// отключить целиком, включается чекбоксом в админке (2026-09-21).
// Остальные модули (собери фразу, таблицы, составь предложение) на флаг не
// смотрят — там озвучка всегда.
export const wordChoiceVoice = makeGlobalBoolSetting({
  key: 'word_choice_voice',
  ls:  'pithy_word_choice_voice_v1',
})
