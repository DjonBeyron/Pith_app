import { localToday } from '../../review/reviewDecks.js'
import { applyLater, isLaterPaused, pruneUntil, pruneStreak } from '../catch/catchLater.js'

// Лимиты показа задания «О чём диалог» на слайде-сцене ленты — по образцу «Ловли слов» (feedCatch.js / catchLater.js),
// свои ключи. Чистые функции над объектами + тонкие обёртки над localStorage/sessionStorage.
//   · не больше TASK_PER_DAY в день; не чаще, чем раз в TASK_GAP слайдов (счёт смен слайда — onSlide из useFeedCatch);
//   · одна сцена — не чаще раза в сутки (scenes: { [sceneId]: 'YYYY-MM-DD' });
//   · «Спроси позже» — пауза сцены на 3 часа, 3 раза подряд — 7 суток (переиспользуются чистые функции catchLater);
//   · принудительный показ для теста из админки — sessionStorage, лимиты обходятся, снимается при показе.
export const TASK_PER_DAY = 5
export const TASK_GAP = 3
export const TASK_KEY = 'pithy_scene_task_v1'
export const TASK_LATER_KEY = 'pithy_scene_task_later_v1'
export const TASK_LATER_STREAK_KEY = 'pithy_scene_task_later_n_v1'
export const TASK_FORCE_KEY = 'pithy_scene_task_force_v1'
const MAX_SCENES = 200

const isObj = v => v && typeof v === 'object' && !Array.isArray(v)

// Состояние дня: { date, count, scenes } — чужая дата обнуляет счётчик, карта сцен чистится от старых дат
export function dayState(raw, today) {
  const s = isObj(raw) ? raw : {}
  const scenes = Object.fromEntries(Object.entries(isObj(s.scenes) ? s.scenes : {}).filter(([, d]) => d === today).slice(-MAX_SCENES))
  return { date: today, count: s.date === today && Number.isInteger(s.count) ? s.count : 0, scenes }
}

// Можно ли показать задание сейчас (чистое решение)
export function canOfferTask({ swipes, state, sceneId, paused = false, forced = false }) {
  if (forced) return true
  if (paused) return false
  if (swipes < TASK_GAP) return false
  if (state.count >= TASK_PER_DAY) return false
  return state.scenes[sceneId] !== state.date
}

// Отметить показ → новое состояние
export function markTaskShown(state, sceneId) {
  return { ...state, count: state.count + 1, scenes: { ...state.scenes, [sceneId]: state.date } }
}

function read(key, storage) {
  try { return JSON.parse(storage.getItem(key) ?? 'null') } catch { return null }
}
function write(key, value, storage) {
  try { storage.setItem(key, JSON.stringify(value)) } catch { /* приватный режим */ }
}
const ls = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null } }
const ss = () => { try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null } catch { return null } }

// Шлюз ленты: счётчик слайдов (в памяти, на сессию) + хранилище лимитов. Фабрика — для тестов
export function createTaskGate({ storage = ls, session = ss, now = () => Date.now(), today = localToday } = {}) {
  let swipes = TASK_GAP // первая сцена после входа в ленту может спросить сразу
  let last = null
  return {
    onSlide(moduleId) {
      if (!moduleId || moduleId === last) return
      last = moduleId
      swipes += 1
    },
    swipes: () => swipes,
    forced(sceneId) {
      const f = read(TASK_FORCE_KEY, session() ?? { getItem: () => null })
      return !!f && f.sceneId === sceneId
    },
    // Решение «показать» с учётом всех лимитов; при true — показ сразу записан (принудительный снимается)
    claim(sceneId) {
      if (!sceneId) return false
      const st = storage()
      const forced = this.forced(sceneId)
      const t = today()
      const state = dayState(st ? read(TASK_KEY, st) : null, t)
      const paused = st ? isLaterPaused(read(TASK_LATER_KEY, st), sceneId, now()) : false
      if (!canOfferTask({ swipes, state, sceneId, paused, forced })) return false
      if (forced) { try { session()?.removeItem(TASK_FORCE_KEY) } catch { /* ignore */ } }
      else if (st) write(TASK_KEY, markTaskShown(state, sceneId), st)
      swipes = 0
      return true
    },
    // «Спроси позже»: пауза сцены (3 ч; 3 подряд — 7 суток) → { n, long }
    later(sceneId) {
      const st = storage()
      if (!st) return { n: 1, long: false }
      const r = applyLater(pruneUntil(read(TASK_LATER_KEY, st), now()), pruneStreak(read(TASK_LATER_STREAK_KEY, st), now()), sceneId, now())
      write(TASK_LATER_KEY, r.until, st)
      write(TASK_LATER_STREAK_KEY, r.streak, st)
      return { n: r.n, long: r.long }
    },
  }
}

// Принудительный показ (Админ → Сцены → Сборщик → «Показать задание в ленте»): лимиты обходятся один раз
export function setForcedSceneTask(sceneId) {
  const s = ss()
  if (!s || !sceneId) return false
  write(TASK_FORCE_KEY, { sceneId }, s)
  return true
}

let shared = null
export function sceneTaskGate() {
  if (!shared) shared = createTaskGate()
  return shared
}
