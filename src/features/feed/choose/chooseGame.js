import { resolveTeacher } from '../../../shared/lib/teacherResolve.js'
import { createFeedGame, gameCandidate, GAMES_AFTER } from '../games/feedGame.js'
import { loadChooseDecks } from './chooseLoad.js'
import { pickChooseCard, textOnly } from './chooseTasks.js'

// Игра ленты «Выбери слово» (B4) — настройка общего ядра игр (games/feedGame.js): карточка колоды с нодой word_choice,
// контекст 1–3 ноды играет обычный плеер. Без звука — текстовая версия карточки (chooseTasks.textOnly).
// Отдельный createChooseGame (только эта игра) оставлен для тестов; в ленте все игры идут через games/createFeedGames.js
export const CHOOSE_AFTER = GAMES_AFTER
export const CHOOSE_PREFIX = 'choose:'
export const GAME = 'choose'

export const chooseKind = {
  game: GAME,
  prefix: CHOOSE_PREFIX,
  text: 'Я нашёл игру на минутку — выберешь слово?',
  pick: (loaded, { exclude, inMemory, needText, rand }) => pickChooseCard(loaded?.decks, { exclude, inMemory, needText, rand }),
  build: (pick, { sound, loaded }) => ({
    card: sound ? pick.card : textOnly(pick.card),
    teacher: resolveTeacher(pick.card.teacher, loaded?.teacher),
  }),
}

export const chooseCandidate = word => gameCandidate(chooseKind, word)

// deps — как у createFeedGame (подмена слота, загрузки, хранилища в тестах)
export const createChooseGame = (deps = {}) => createFeedGame({ loadDecks: loadChooseDecks, ...deps, kinds: [chooseKind] })
