import { loadChooseDecks } from '../choose/chooseLoad.js'
import { listWordAudio } from '../../../shared/lib/wordAudio/wordAudioApi.js'

// Всё, что нужно играм ленты, одним запросом: колоды (кэш на 5 минут, chooseLoad.js) + библиотека озвучки слов
// (word_audio — для «Слово голосом → картинка»; её сбой не роняет игры: озвучки нет — будет текстовая версия).
// → { decks: Map(слово → колода), teacher, wordAudio: Map(ключ → строка word_audio) | null }
export async function loadGameData() {
  const [data, wordAudio] = await Promise.all([loadChooseDecks(), listWordAudio().catch(() => null)])
  return { ...data, wordAudio: wordAudio instanceof Map ? wordAudio : null }
}
