import { createFeedGame } from './feedGame.js'
import { chooseKind } from '../choose/chooseGame.js'
import { fillKind } from '../fill/fillGame.js'
import { pictureKind } from '../picture/pictureGame.js'

// Все игры ленты в одном ядре: общие слайды, лимиты и очередь (choose → fill → picture → …, без материала — пропуск).
// deps — подмена слота/загрузки/хранилища в тестах (см. createFeedGame)
export const FEED_GAME_KINDS = [chooseKind, fillKind, pictureKind]
export const createFeedGames = (deps = {}) => createFeedGame({ kinds: FEED_GAME_KINDS, ...deps })
