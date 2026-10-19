import { pLog } from './debug.js'
import { APP_VERSION } from './version.js'

// Кэш звуков интерфейса (sounds.js): mp3 лежат в ПАМЯТИ на всю сессию (Blob) и в Cache Storage между запусками.
// Зачем: на нестабильном интернете <audio> с обычным адресом при первом проигрывании ждал сеть — звук «верно»/«сообщение»
// стартовал через 5 секунд и больше, когда уже шёл следующий шаг урока («догоняют»). Из памяти звук стартует сразу,
// из Cache Storage — со второго запуска даже без сети. Файл заменяется только с новой версией приложения (адрес с ?v=).
// Загрузка идёт с высоким приоритетом и ПЕРЕД тяжёлыми медиа урока (usePlayerPreload ждёт sfxBlocking(), максимум SFX_HEAD_START_MS).
export const SFX_HEAD_START_MS = 4000 // дольше этого предзагрузка медиа звуки не ждёт
const PARALLEL = 3
const cacheName = () => `pithy-sfx-${APP_VERSION}`
const urlOf = name => `/sounds/${name}.mp3?v=${APP_VERSION}`

const blobs = new Map()   // name → Blob
const urls = new Map()    // name → blob: адрес для <audio>
const readySubs = new Set()
const settledSubs = new Set()
let startedAt = 0
let settled = true
let running = null

/** cb(name) — звук оказался в памяти (элементу с сетевым адресом можно подменить src на blob:). Возвращает отписку */
export function onSfxReady(cb) { readySubs.add(cb); return () => readySubs.delete(cb) }

/** Одноразовая подписка: прогрев закончился (успешно или нет). Если он уже не идёт — сработает сразу */
export function onSfxSettled(cb) {
  if (settled) { cb(); return () => {} }
  settledSubs.add(cb)
  return () => settledSubs.delete(cb)
}

/** Прогрев идёт и ещё не вышел срок головного старта: медиа урока пока подождут (звуки в сети идут первыми) */
export function sfxBlocking(now = Date.now()) {
  return !settled && now - startedAt < SFX_HEAD_START_MS
}

/** Сколько мс головного старта звуков осталось (0 — медиа уже можно качать); по таймеру предзагрузка просыпается сама, а не ждёт конца ВСЕГО прогрева */
export function sfxHeadStartLeft(now = Date.now()) {
  return settled ? 0 : Math.max(0, SFX_HEAD_START_MS - (now - startedAt))
}

export const sfxBlobUrl = name => {
  if (urls.has(name)) return urls.get(name)
  const b = blobs.get(name)
  if (!b || typeof URL?.createObjectURL !== 'function') return null
  const u = URL.createObjectURL(b)
  urls.set(name, u)
  return u
}

/** Копия байтов звука из памяти (decodeAudioData «съедает» буфер) или null, если звука в памяти ещё нет */
export const sfxBytes = name => blobs.get(name)?.arrayBuffer() ?? null

export const sfxIsReady = name => blobs.has(name)

async function openCache() {
  try {
    if (typeof caches === 'undefined') return null
    const c = await caches.open(cacheName())
    // чужие версии не копим: каждый деплой — новый адрес
    caches.keys().then(keys => keys.filter(k => k.startsWith('pithy-sfx-') && k !== cacheName()).forEach(k => caches.delete(k))).catch(() => {})
    return c
  } catch { return null }
}

async function loadOne(name, cache, fetchFn) {
  if (blobs.has(name)) return
  const url = urlOf(name)
  let res = null
  try { res = cache ? await cache.match(url) : null } catch { res = null }
  let from = 'кэш'
  if (!res) {
    from = 'сеть'
    res = await fetchFn(url, { cache: 'force-cache', priority: 'high' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    try { cache?.put(url, res.clone()).catch(() => {}) } catch { /* кэш недоступен — звук всё равно в памяти */ }
  }
  const blob = await res.blob()
  blobs.set(name, blob)
  pLog(`[sfx] ${name} в памяти (${from}, ${Math.round(blob.size / 1024)} КБ, +${Date.now() - startedAt} мс)`)
  readySubs.forEach(cb => { try { cb(name) } catch { /* подписчик не должен ломать прогрев */ } })
}

/**
 * Греет звуки в память: Cache Storage → сеть (высокий приоритет, не больше PARALLEL одновременно). Идемпотентен: пока идёт
 * прогрев, возвращает тот же промис. Ошибка одного звука остальные не останавливает (он доиграет по обычному адресу)
 */
export function warmSfx(names, { fetchFn = globalThis.fetch?.bind(globalThis) } = {}) {
  if (typeof fetchFn !== 'function') return Promise.resolve()
  const todo = names.filter(n => !blobs.has(n))
  if (!todo.length) return Promise.resolve()
  if (running) return running
  startedAt = Date.now()
  settled = false
  running = (async () => {
    const cache = await openCache()
    const queue = [...todo]
    const worker = async () => {
      for (let name = queue.shift(); name; name = queue.shift()) {
        try { await loadOne(name, cache, fetchFn) } catch (e) { pLog(`[sfx] ${name} не загрузился: ${e.message}`) }
      }
    }
    await Promise.all(Array.from({ length: PARALLEL }, worker))
  })().finally(() => {
    running = null
    settled = true
    const subs = [...settledSubs]; settledSubs.clear()
    subs.forEach(cb => { try { cb() } catch { /* подписчик не должен ломать прогрев */ } })
    pLog(`[sfx] прогрев закончен за ${Date.now() - startedAt} мс: в памяти ${blobs.size}`)
  })
  return running
}

/** Только для тестов */
export function resetSfxCacheForTests() {
  blobs.clear(); urls.clear(); readySubs.clear(); settledSubs.clear(); running = null; settled = true; startedAt = 0
}
