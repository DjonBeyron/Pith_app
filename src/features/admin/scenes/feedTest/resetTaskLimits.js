import { TASK_KEY, TASK_LATER_KEY, TASK_LATER_STREAK_KEY, TASK_FORCE_KEY } from '../../../feed/scene/sceneTaskLimits.js'

// Сброс тестовых лимитов задания на этом устройстве (Админ → Сцены → «Тест в ленте»): очищает счётчик дня, паузы «Спроси позже»
// и серию, а также незавершённый принудительный показ. Ключи — из sceneTaskLimits.js (там их единственный источник).
// → число реально удалённых ключей. storage/session — для тестов.
export function resetSceneTaskLimits({ storage = safe(() => localStorage), session = safe(() => sessionStorage) } = {}) {
  let n = 0
  for (const [st, keys] of [[storage, [TASK_KEY, TASK_LATER_KEY, TASK_LATER_STREAK_KEY]], [session, [TASK_FORCE_KEY]]]) {
    if (!st) continue
    for (const k of keys) {
      try {
        if (st.getItem(k) !== null) { st.removeItem(k); n += 1 }
      } catch { /* приватный режим */ }
    }
  }
  return n
}

function safe(get) {
  try { return get() } catch { return null }
}
