import { getCachedProfile } from '../../shared/api/profileCache.js'
import { markSlowmoHintSeen } from '../../shared/api/profileApi.js'
import { ARM_AT_VIDEO, MAX_IGNORED } from './slowmoHintPlan.js'
import { useFeedHint } from './useFeedHint.js'

const SEEN_KEY = 'pithy_slowmo_hint_seen_v1'
const IGNORED_KEY = 'pithy_slowmo_hint_ignored_v1' // сколько видео с подсказкой пролистано без неё (между посещениями)

// Обучающая подсказка «зажми лайк — замедли видео» (см. feedSlowZone в FeedHud.jsx). Правила показа — в useFeedHint.js:
// на 3-м видео при первом посещении, насовсем после трёх игноров или когда ею воспользовались. Прячется не по тапу,
// а только когда замедление реально успело подействовать — markSeenNow вызывается из FeedHud после удержания дольше
// порога. «Видел» хранится и в профиле: на другом устройстве подсказка не всплывёт снова
const CFG = {
  seenKey: SEEN_KEY,
  ignoredKey: IGNORED_KEY,
  armAt: ARM_AT_VIDEO,
  maxIgnored: MAX_IGNORED,
  serverSeen: () => !!getCachedProfile()?.slowmo_hint_seen,
  onRetire: () => { if (getCachedProfile()) markSlowmoHintSeen() },
}

export const useSlowMotionHint = activeIdx => useFeedHint(activeIdx, CFG)

// Вызывается один раз сразу после успешной регистрации (RegisterForm.jsx):
// если гость уже видел подсказку локально — переносим флаг на свежий
// серверный профиль, чтобы она не всплыла снова на другом устройстве.
export function transferSlowMotionHintOnRegister() {
  let seenLocally = false
  try { seenLocally = localStorage.getItem(SEEN_KEY) === '1' } catch { /* нет localStorage */ }
  if (seenLocally) markSlowmoHintSeen()
}
