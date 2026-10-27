import { pickFillTask, openFill } from './fillTasks.js'

// Игра ленты «Дополни реплику» (B5) — настройка общего ядра игр (games/feedGame.js): озвученная реплика колоды, на месте
// слова «мяу», три слова на выбор. Звука нет — реплика текстом (fillTasks.openFill).
export const fillKind = {
  game: 'fill',
  prefix: 'fill:',
  text: 'Пит нашёл игру на минутку — дополнишь реплику?',
  pick: (loaded, { exclude, inMemory, sound, rand }) => pickFillTask(loaded?.decks, { exclude, inMemory, sound, rand }),
  build: openFill,
}
