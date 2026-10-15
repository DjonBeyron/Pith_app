import { SANDBOX_ID } from '../../../../shared/lib/analytics/sandboxGuard.js'

// Хранилище «песочницы сцены в ленте»: тестовая сцена админа, которая показывается в ленте обособленным слайдом
// и ни к чему не привязана (ни curricula.scene_id, ни библиотека scenes, ни запись в БД).
// Живёт в sessionStorage: до закрытия вкладки браузера и только на этом устройстве. Не localStorage — чтобы забытый
// тестовый слайд не появлялся у админа в ленте неделями; нужен снова — «Открыть в песочнице» ставит его за секунду.
// Запись: { v: 1, scene: <сцена v2 целиком>, taskForce: boolean, origin: 'admin' | 'node' | 'module', createdAt: number }.
// origin — откуда запущен тест (кнопка «← Вернуться в сборщик» на тестовом слайде; admin — обычный сборщик админки).
// Любое обращение к хранилищу — в try/catch (приватный режим, переполнение, нет window).
export const SANDBOX_KEY = 'pithy_feed_sandbox_v1'
export const SANDBOX_EVENT = 'pithy:feed-sandbox'
export { SANDBOX_ID }

const MAX_CHARS = 1_500_000 // сцена v2 — десятки КБ; больше — явно мусор, sessionStorage ~5 МБ

export const SANDBOX_ORIGINS = ['admin', 'node', 'module']
const originOf = v => (SANDBOX_ORIGINS.includes(v) ? v : 'admin')
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v)
const ss = () => { try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null } catch { return null } }

// Разбор по сырой строке кэшируется: чтение вызывается из useSyncExternalStore на каждый рендер и обязано отдавать
// ТОТ ЖЕ объект, пока запись не изменилась
let memo = { raw: undefined, value: null }

export function parseSandbox(raw) {
  if (typeof raw !== 'string' || !raw || raw.length > MAX_CHARS) return null
  try {
    const d = JSON.parse(raw)
    if (!isObj(d) || d.v !== 1 || !isObj(d.scene) || !Number.isFinite(d.createdAt)) return null
    return { scene: d.scene, taskForce: !!d.taskForce, origin: originOf(d.origin), createdAt: d.createdAt }
  } catch { return null }
}

export function readSandbox(storage = ss()) {
  let raw = null
  try { raw = storage?.getItem(SANDBOX_KEY) ?? null } catch { return null }
  if (memo.raw === raw) return memo.value
  memo = { raw, value: parseSandbox(raw) }
  return memo.value
}

const emit = () => { try { window.dispatchEvent(new CustomEvent(SANDBOX_EVENT)) } catch { /* нет window */ } }

// → true, если записали. Сцена — объект (полный JSON v2 из черновика сборщика); валидность проверит стор сцен ленты
export function writeSandbox({ scene, taskForce = false, origin = 'admin' }, { storage = ss(), now = Date.now } = {}) {
  if (!storage || !isObj(scene)) return false
  try {
    const raw = JSON.stringify({ v: 1, scene, taskForce: !!taskForce, origin: originOf(origin), createdAt: now() })
    if (raw.length > MAX_CHARS) return false
    storage.setItem(SANDBOX_KEY, raw)
  } catch { return false }
  emit()
  return true
}

export function clearSandbox(storage = ss()) {
  try { storage?.removeItem(SANDBOX_KEY) } catch { /* приватный режим */ }
  emit()
}

// Подписка на изменения (то же окно и другие вкладки: событие storage)
export function onSandboxChange(fn) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(SANDBOX_EVENT, fn)
  window.addEventListener('storage', fn)
  return () => { window.removeEventListener(SANDBOX_EVENT, fn); window.removeEventListener('storage', fn) }
}
