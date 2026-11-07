// Есть ли озвучка у слов фразы этапа «Фразы» (замечание владельца с iPhone, 2026-11-07: «Пит говорит пример, но там нет английских слов»). Слово фразы Пит говорит голосом диктора
// (useWordLaneFlow.sayText → wordLaneLib.libRow → библиотека word_audio по wordKey слова). Слова нет в библиотеке — libRow null → speakWord молчит (голоса системы нет), а скрипт идёт по оценке длины:
// пилюля заливается в тишине. Демо «Скажи» берёт только фразу, у которой озвучено КАЖДОЕ слово (racePhraseDemo.demoPhrase), а слово без озвучки пишется в журнал (racePhraseDemoTurn, racePhraseVoice).
import { cachedWordAudio } from '../../shared/lib/wordAudio/wordAudioApi.js'
import { wordKey } from '../../shared/lib/wordAudio/wordKey.js'
import { phraseWords } from './racePhraseData.js'

/** Есть ли у слова запись в библиотеке word_audio (url); библиотека не загружена — нет */
export const wordVoiced = (word, lib = cachedWordAudio()) => { const k = wordKey(word); return !!(k && lib?.get?.(k)?.url) }

/** Слова фразы без озвучки (как написаны в тексте) */
export const unvoicedWords = (text, lib = cachedWordAudio()) => phraseWords(text).filter(w => !wordVoiced(w, lib))

/** Озвучено ли каждое слово фразы (пустая фраза — нет) */
export const phraseWordsVoiced = (text, lib = cachedWordAudio()) => phraseWords(text).length > 0 && !unvoicedWords(text, lib).length

/** Проверка для выбора демо-фразы: text → озвучены ли все слова. Библиотека ещё не загружена (тесты, план до прогрева) — не судим: любая фраза годится */
export const voicedPhraseTest = (lib = cachedWordAudio()) => (lib ? text => phraseWordsVoiced(text, lib) : () => true)
