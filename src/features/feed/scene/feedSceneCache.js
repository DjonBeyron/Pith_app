// Кэш сцен ленты: память + localStorage. Хранится по id строки `scenes`:
// { scene: сырой jsonb, updated_at, at: когда положили }. Между запусками кэш
// нужен, чтобы первый слайд со сценой рисовался без ожидания сети (как постер
// у видео). Объём ограничен: не больше MAX_ENTRIES сцен и MAX_BYTES всего —
// лишние (самые старые по `at`) выпадают. Любое обращение к storage — в
// try/catch: приватный режим, забитая квота, отключённый storage не ломают ленту.

export const CACHE_KEY = 'pithy_feed_scenes_v1'
export const MAX_ENTRIES = 24
export const MAX_BYTES = 600 * 1024

function byteSize(value) {
  try { return JSON.stringify(value).length } catch { return Infinity }
}

// Чистая: обрезает словарь записей под лимиты, оставляя самые свежие (по `at`).
// Запись больше maxBytes целиком — выбрасывается (в кэш такой не положить)
export function trimEntries(entries, { maxEntries = MAX_ENTRIES, maxBytes = MAX_BYTES } = {}) {
  const sorted = Object.entries(entries ?? {})
    .filter(([, e]) => e && typeof e === 'object' && e.scene)
    .sort((a, b) => (b[1].at ?? 0) - (a[1].at ?? 0))
  const out = {}
  let total = 0
  for (const [id, e] of sorted) {
    if (Object.keys(out).length >= maxEntries) break
    const size = byteSize(e)
    if (total + size > maxBytes) continue
    total += size
    out[id] = e
  }
  return out
}

export function readStorage(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(CACHE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function writeStorage(entries, storage = globalThis.localStorage) {
  try {
    if (!storage) return false
    storage.setItem(CACHE_KEY, JSON.stringify(trimEntries(entries)))
    return true
  } catch {
    return false
  }
}

// Кэш в памяти с ленивой подгрузкой из storage и отложенной записью
export function createSceneCache({ storage = globalThis.localStorage, now = () => Date.now(), schedule = fn => setTimeout(fn, 250) } = {}) {
  let entries = null
  let flushPlanned = false
  const ensure = () => { if (!entries) entries = readStorage(storage) }
  const flush = () => { flushPlanned = false; writeStorage(entries ?? {}, storage) }
  return {
    get(id) {
      ensure()
      return entries[id] ?? null
    },
    put(id, { scene, updated_at }) {
      ensure()
      entries[id] = { scene, updated_at: updated_at ?? null, at: now() }
      entries = trimEntries(entries)
      if (!flushPlanned) { flushPlanned = true; schedule(flush) }
    },
    size() { ensure(); return Object.keys(entries).length },
  }
}
