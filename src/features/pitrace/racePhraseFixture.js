// Фикстура фраз этапа 2 «Фразы» (контракт этапа 2: plan.phrases строит слой данных, движок только читает) для тестов, стенда (_stand/race) и плана-симуляции
// (source 'sim', racePhraseData.phrasesOf): три своих фразы и одна дежурная, смысл ru заполнен, ситуация scene — у своих (у дежурной пусто: круг 1 говорит ru), целой озвучки нет (audio: null — Пит читает по словам). Чистые данные.
const w = (text, translation, level = 1) => ({ text, translation, level })

export const PHRASE_FIXTURE = [
  { id: 'fx-nice', text: 'Nice to meet you', key: 'nice to meet you', ru: 'скажи, что рад знакомству', scene: 'ты знакомишься с новым человеком', own: true, level: 1, audio: null, words: [w('nice', 'приятно', 3), w('meet', 'встретить', 1)] },
  { id: 'fx-from', text: 'Where are you from', key: 'where are you from', ru: 'спроси, откуда человек', scene: 'ты хочешь узнать, из какой он страны', own: true, level: 2, audio: null, words: [w('where', 'где', 4), w('from', 'откуда', 3)] },
  { id: 'fx-learn', text: "I'm trying to learn", key: "i'm trying to learn", ru: 'скажи, что стараешься научиться', scene: 'тебя спросили, зачем тебе английский', own: true, level: 0, audio: null, words: [w('trying', 'пытаюсь', 2), w('learn', 'учиться', 0)] },
  { id: 'fx-later', text: 'See you later', key: 'see you later', ru: 'попрощайся до скорого', own: false, level: 3, audio: null, words: [w('see', 'видеть', 3), w('later', 'позже', 2)] },
]
