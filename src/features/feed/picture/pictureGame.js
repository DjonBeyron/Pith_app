import { pickPictureTask, openPicture } from './pictureTasks.js'

// Игра ленты «Слово голосом → картинка» (B5) — настройка общего ядра игр (games/feedGame.js): слово звучит из библиотеки
// word_audio (нет озвучки или звук выключен — слово текстом), три картинки из ноды photo_choice карточки колоды.
// Карточек photo_choice сейчас мало: нет ни одной — pick вернёт null и игра молчит (не предлагается).
export const pictureKind = {
  game: 'picture',
  prefix: 'picture:',
  text: 'Я нашёл игру на минутку — угадаешь слово по картинке?',
  pick: (loaded, { exclude, inMemory, rand }) => pickPictureTask(loaded?.decks, { exclude, inMemory, wordAudio: loaded?.wordAudio, rand }),
  build: openPicture,
}
