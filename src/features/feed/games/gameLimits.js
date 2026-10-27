// Общие лимиты показа игр ленты («Выбери слово», «Дополни реплику», «Картинка») — по образцу
// scene/sceneTaskLimits.js и catch/feedCatch.js. Чистые функции над объектом дня + тонкие обёртки над localStorage
// (приватный режим / нет хранилища — просто без записи). Лимит один на все игры вместе:
//   · не больше GAME_PER_DAY предложений в день (считаются в момент, когда бюджет Пита выбрал предложение);
//   · не чаще, чем раз в GAME_GAP слайдов (счёт смен слайда ведёт feedGame.js);
//   · игры чередуются по кругу (GAME_ORDER): `last` — какая показана последней (переживает смену дня).
// Ключ остался прежним ('pithy_feed_choose_v1'): счётчик дня, начатый «Выбери слово», продолжается.
export const GAMES_KEY = 'pithy_feed_choose_v1'
export const GAME_PER_DAY = 4
export const GAME_GAP = 6
export const GAME_ORDER = ['choose', 'fill', 'picture']

const isObj = v => v && typeof v === 'object' && !Array.isArray(v)

// Состояние дня { date, count, last }: чужая дата (или мусор в хранилище) обнуляет счётчик, но не очередь игр
export function gamesDay(raw, today) {
  const s = isObj(raw) ? raw : {}
  return {
    date: today,
    count: s.date === today && Number.isInteger(s.count) && s.count > 0 ? s.count : 0,
    last: GAME_ORDER.includes(s.last) ? s.last : null,
  }
}

// Можно ли предложить игру сейчас
export const canOfferGame = ({ swipes, state }) => swipes >= GAME_GAP && state.count < GAME_PER_DAY

// Почему нельзя (для отладки и тестов): null — можно
export function gameBlockReason({ swipes, state }) {
  if (swipes < GAME_GAP) return `ещё не прошло ${GAME_GAP} слайдов с прошлого предложения`
  if (state.count >= GAME_PER_DAY) return `${GAME_PER_DAY} предложений в день уже было`
  return null
}

// Показ записан: счётчик дня растёт, очередь сдвигается за показанную игру
export const markGameShown = (state, game) => ({
  ...state, count: state.count + 1, last: GAME_ORDER.includes(game) ? game : state.last,
})

// Порядок, в котором игры просят материал: сначала та, что следует за показанной последней (по кругу), потом дальше.
// Последней не было — с первой игры. games — названия игр, которые вообще подключены
export function gameRotation(games, last) {
  const order = GAME_ORDER.filter(g => games.includes(g))
  const at = order.indexOf(last)
  return at < 0 ? order : [...order.slice(at + 1), ...order.slice(0, at + 1)]
}

const ls = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null } }

export function readGamesDay(today, storage = ls) {
  try { return gamesDay(JSON.parse(storage()?.getItem(GAMES_KEY) ?? 'null'), today) } catch { return gamesDay(null, today) }
}
export function writeGamesDay(state, storage = ls) {
  try { storage()?.setItem(GAMES_KEY, JSON.stringify(state)) } catch { /* приватный режим */ }
}
