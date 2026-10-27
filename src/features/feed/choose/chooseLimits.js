// Лимиты показа игры ленты «Выбери слово» — по образцу scene/sceneTaskLimits.js и catch/feedCatch.js, свой ключ.
// Чистые функции над объектом дня + тонкие обёртки над localStorage (приватный режим / нет хранилища — просто без записи).
//   · не больше CHOOSE_PER_DAY предложений в день (считаются в момент, когда бюджет Пита выбрал предложение);
//   · не чаще, чем раз в CHOOSE_GAP слайдов (счёт смен слайда ведёт chooseGame.js).
export const CHOOSE_KEY = 'pithy_feed_choose_v1'
export const CHOOSE_PER_DAY = 4
export const CHOOSE_GAP = 6

const isObj = v => v && typeof v === 'object' && !Array.isArray(v)

// Состояние дня { date, count }: чужая дата (или мусор в хранилище) обнуляет счётчик
export function chooseDay(raw, today) {
  const s = isObj(raw) ? raw : {}
  return { date: today, count: s.date === today && Number.isInteger(s.count) && s.count > 0 ? s.count : 0 }
}

// Можно ли предложить игру сейчас
export const canOfferChoose = ({ swipes, state }) => swipes >= CHOOSE_GAP && state.count < CHOOSE_PER_DAY

// Почему нельзя (для отладки и тестов): null — можно
export function chooseBlockReason({ swipes, state }) {
  if (swipes < CHOOSE_GAP) return `ещё не прошло ${CHOOSE_GAP} слайдов с прошлого предложения`
  if (state.count >= CHOOSE_PER_DAY) return `${CHOOSE_PER_DAY} предложений в день уже было`
  return null
}

export const markChooseShown = state => ({ ...state, count: state.count + 1 })

const ls = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null } }

export function readChooseDay(today, storage = ls) {
  try { return chooseDay(JSON.parse(storage()?.getItem(CHOOSE_KEY) ?? 'null'), today) } catch { return chooseDay(null, today) }
}
export function writeChooseDay(state, storage = ls) {
  try { storage()?.setItem(CHOOSE_KEY, JSON.stringify(state)) } catch { /* приватный режим */ }
}
