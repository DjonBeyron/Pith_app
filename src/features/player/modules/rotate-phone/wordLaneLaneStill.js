// Режим узора дорожек (v3.3.382 «стоит», v3.3.387 «реже»). Журнал владельца со слабого Android: движущийся узор стоил ≈ 10–15 кадров/с (на Mali каждый кадр композитора пересобирает слои экрана), с «Стоит» — 52–60 fps.
// Три режима: 'move' — «Едет» (бесконечная анимация слоя, 60 смен в секунду), 'steps' — «Реже» (та же анимация, но easing steps(n, end): узор меняет положение ≈ 10 раз в секунду, laneConveyorMover.stepsFor), 'still' — «Стоит» (только яркость).
// Что выбрал владелец — в localStorage pithy_wl_lane_mode_v1; старый ключ pithy_wl_lane_still_v1 = '1' (v3.3.382) читается как «Стоит». Ничего не выбрано: везде «Едет» (v3.3.388: владелец — «Реже» выглядит рвано и даёт впечатление лагов; плавность важнее, а связь лагов именно с узором не доказана — первая «едущая» игра шла сразу после тяжёлой загрузки страницы, вторая «стоящая» — на прогретой).
// Читает WordLanePills при старте игры, переключают HUD и окно комментария («после «Игра заново»»). Файл без импортов: слабость устройства приходит параметром.
export const LANE_STILL_KEY = 'pithy_wl_lane_still_v1'
export const LANE_MODE_KEY = 'pithy_wl_lane_mode_v1'
export const LANE_MODES = ['move', 'steps', 'still']
export const LANE_MODE_LABELS = { move: 'едет', steps: 'реже', still: 'стоит' }

const get = (k, store) => { try { return store?.getItem(k) ?? null } catch { return null } }

/** Выбор владельца: 'move' | 'steps' | 'still' или null (не выбирал) */
export function readLaneChoice(store = globalThis.localStorage) {
  const v = get(LANE_MODE_KEY, store)
  if (LANE_MODES.includes(v)) return v
  return get(LANE_STILL_KEY, store) === '1' ? 'still' : null
}
/** Режим узора: выбор владельца, а без выбора — «Едет» (параметр weak оставлен для совместимости вызовов) */
// eslint-disable-next-line no-unused-vars
export const readLaneMode = (weak = false, store = globalThis.localStorage) => readLaneChoice(store) ?? 'move'
export function writeLaneMode(mode, store = globalThis.localStorage) {
  try { if (!LANE_MODES.includes(mode)) return; store?.setItem(LANE_MODE_KEY, mode); store?.removeItem(LANE_STILL_KEY) } catch { /* приватный режим — живёт до перезагрузки */ }
}
// Прежний интерфейс (v3.3.382): «стоит» ли узор
export const readLaneStill = (store = globalThis.localStorage) => readLaneChoice(store) === 'still'
export function writeLaneStill(on, store = globalThis.localStorage) {
  try { if (on) writeLaneMode('still', store); else { store?.removeItem(LANE_MODE_KEY); store?.removeItem(LANE_STILL_KEY) } } catch { /* приватный режим */ }
}
