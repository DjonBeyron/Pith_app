import { requestOpenModule } from '../../../shared/lib/openModuleEvent.js'

// Принудительное задание «Ловли слов» (Админ → Ловля → «Отправить в ленту»): автор смотрит задание в настоящей ленте
// на выбранной фразе с уровнями слов из песочницы — без своей памяти и без лимитов показа. Живёт в sessionStorage
// (разово, на вкладку браузера): { moduleId, levels: { [index слова]: 0..4 }, writeMemory }.
// Лента (useSlideCatch) читает его для слайда своего модуля; «Готово» или «Раскрыть» — снимает.
const KEY = 'pithy_catch_force_v1'
const FORCE_EVENT = 'pithy:catch-force' // задание выставлено — слайд, уже стоящий в ленте, перечитывает его
const JUMP_EVENT = 'pithy:feed-jump' // повернуть ленту к фразе (useFeedModules.pinnedId)

// Шаг и «постоянная память» для каждого уровня (0 — слова нет в памяти)
const STEP_OF_LEVEL = { 1: 1, 2: 3, 3: 5, 4: 5 }

// Знание из выбранных уровней: words — [{ index, key }] (catchWords), levels — { [index]: 0..4 }.
// defaultIndex — слово, у которого без явного уровня стоит 2 (дефолт песочницы); -1 — нет такого. → { stepOf, settledOf }
export function forcedKnowledge(words, levels, defaultIndex = -1) {
  const stepOf = new Map()
  const settledOf = new Set()
  for (const w of words) {
    const lvl = levels?.[w.index] ?? (w.index === defaultIndex ? 2 : 0)
    if (!lvl || !w.key) continue
    stepOf.set(w.key, STEP_OF_LEVEL[lvl])
    if (lvl === 4) settledOf.add(w.key)
  }
  return { stepOf, settledOf }
}

// → true, если записали; false — sessionStorage недоступен (тогда задание не выставлено)
export function setForcedCatch({ moduleId, levels, writeMemory }) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ moduleId, levels: levels ?? {}, writeMemory: !!writeMemory }))
  } catch { return false }
  try { window.dispatchEvent(new CustomEvent(FORCE_EVENT)) } catch { /* нет window */ }
  return true
}

export function getForcedCatch() {
  try {
    const f = JSON.parse(sessionStorage.getItem(KEY) ?? 'null')
    return f && typeof f.moduleId === 'string' ? f : null
  } catch { return null }
}

export function clearForcedCatch() {
  try { sessionStorage.removeItem(KEY) } catch { /* приватный режим */ }
}

function subscribe(event, fn) {
  const h = e => fn(e.detail)
  window.addEventListener(event, h)
  return () => window.removeEventListener(event, h)
}

export const onForcedCatch = fn => subscribe(FORCE_EVENT, fn)
export const onFeedJump = fn => subscribe(JUMP_EVENT, fn) // fn({ moduleId })

// Показать фразу первой в ленте: повернуть ленту к модулю и переключить оболочку на вкладку «Уроки».
// requestOpenModule без id: ShellV2 переключает вкладку, а FeedTab не открывает схему модуля (ждёт m.id)
export function sendToFeed(moduleId) {
  window.dispatchEvent(new CustomEvent(JUMP_EVENT, { detail: { moduleId } }))
  requestOpenModule({})
}
