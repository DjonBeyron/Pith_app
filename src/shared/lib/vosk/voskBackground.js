// Планировщик тихой фоновой предзагрузки модели Vosk в Cache Storage (этап 1; движок и библиотека vosk-browser здесь НЕ грузятся).
// Решения «можно ли качать» — voskBgPolicy.js, сами куски и докачка — voskBgDownload.js, один экземпляр на все вкладки — voskBgLock.js,
// «занята ли сеть» — netBusy.js. Здесь: проверка кэша → замок → цикл попыток (до 5 за сессию, пауза 5/10/20/40/60 с) → статус для админа.
// Пользователю ничего не показывается; ошибки пишутся в журнал плеера (pLog «[vosk-bg]»).
import { pLog } from '../debug.js'
import * as netBusy from '../netBusy.js'
import { readModelUrl } from './voskConfig.js'
import { VoskError, isRetryable, errorText } from './voskErrors.js'
import { peekCached, cacheAvailable, requestPersist, deleteModel } from './voskStorage.js'
import { canStart, envSnapshot, isStopped, nextDelay, pollDelay, chunkPause, MAX_ATTEMPTS } from './voskBgPolicy.js'
import { backgroundDownload } from './voskBgDownload.js'
import { clearParts } from './voskParts.js'
import { acquireLock } from './voskBgLock.js'
import { setBgStatus, resetBgStatus, getBgStatus } from './voskBgStatus.js'

let persistAsked = false
const persistOnce = nav => { if (persistAsked) return Promise.resolve(); persistAsked = true; return requestPersist(nav) }

// Сон, который просыпается раньше при возвращении сети / приложения на экран и бросает 'cancelled' по сигналу
function sleepWake(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new VoskError('cancelled'))
    const w = globalThis.window, doc = globalThis.document
    const off = () => { clearTimeout(t); signal?.removeEventListener('abort', onAbort); w?.removeEventListener?.('online', wake); doc?.removeEventListener?.('visibilitychange', wake) }
    const wake = () => { off(); resolve() }
    const onAbort = () => { off(); reject(new VoskError('cancelled')) }
    const t = setTimeout(wake, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
    w?.addEventListener?.('online', wake, { once: true })
    doc?.addEventListener?.('visibilitychange', wake)
  })
}

function withDefaults(deps) {
  const d = {
    nav: globalThis.navigator, doc: globalThis.document, cachesApi: globalThis.caches, sleep: sleepWake, rand: Math.random,
    lock: acquireLock, persist: persistOnce, log: msg => pLog(`[vosk-bg] ${msg}`), now: () => performance.now(),
    busy: { net: netBusy.isBusy, feed: netBusy.isFeedActive, video: () => netBusy.isVideoActive() }, watchBusy: netBusy.subscribe,
    ...deps,
  }
  d.store ??= (() => { try { return globalThis.localStorage } catch { return null } })()
  d.url ??= readModelUrl()
  d.fetchFn ??= globalThis.fetch?.bind(globalThis)
  d.snapshot = () => envSnapshot({ nav: d.nav, doc: d.doc, busy: d.busy, stopped: isStopped(d.store) })
  return d
}

async function run(signal, deps) {
  const d = withDefaults(deps)
  setBgStatus({ state: 'check', reason: null, error: '' })
  if (!d.fetchFn || !cacheAvailable(d.cachesApi)) return setBgStatus({ state: 'error', error: 'нет Cache Storage или fetch (нужен https)' })
  if (isStopped(d.store)) return setBgStatus({ state: 'off' })
  if (await peekCached(d.url, d.cachesApi)) return setBgStatus({ state: 'cached', pct: 100 })
  const release = await d.lock({ nav: d.nav, store: d.store })
  if (!release) return setBgStatus({ state: 'other' })
  try {
    d.persist(d.nav)
    await attempts(signal, d)
  } finally { release() }
}

async function attempts(signal, d) {
  // Ждём тишины перед каждым куском; пока нельзя — статус «ждёт (причина)», проверка раз в 2,5 с (раз в 30 с при экономии трафика)
  const gate = async () => {
    for (;;) {
      if (signal.aborted) throw new VoskError('cancelled')
      const v = canStart(d.snapshot())
      if (v.ok) { if (getBgStatus().state !== 'downloading') setBgStatus({ state: 'downloading', reason: null }); return }
      if (v.reason === 'off') throw new VoskError('cancelled')
      if (getBgStatus().reason !== v.reason || getBgStatus().state !== 'waiting') { setBgStatus({ state: 'waiting', reason: v.reason }); d.log(`ждём: ${v.reason}`) }
      await d.sleep(pollDelay(v.reason), signal)
    }
  }
  const ctx = {
    fetchFn: d.fetchFn, cachesApi: d.cachesApi, signal, gate, now: d.now, chunkBytes: d.chunkBytes, stallMs: d.stallMs,
    pause: () => d.sleep(chunkPause(d.rand()), signal), watchBusy: d.watchBusy, shouldYield: () => d.busy.net() || d.busy.feed(),
    log: d.log,
    onProgress: ({ loaded, total, mode }) => setBgStatus({ state: 'downloading', reason: null, loaded, total, mode, pct: total > 0 ? Math.min(100, Math.floor((loaded / total) * 100)) : null }),
  }
  let failures = 0
  for (;;) {
    try {
      const r = await backgroundDownload(d.url, ctx)
      d.log(`модель в кэше: ${r.size} байт, режим ${r.mode}`)
      return setBgStatus({ state: 'cached', pct: 100, reason: null, error: '', mode: r.mode })
    } catch (e) {
      if (signal.aborted || e?.code === 'cancelled') return setBgStatus({ state: isStopped(d.store) ? 'off' : 'idle', reason: null })
      if (d.nav?.onLine !== false) failures++ // обрыв из-за офлайна попытку не тратит: gate всё равно дождётся сети
      d.log(`ошибка (${e?.code ?? e?.name}): ${errorText(e)}; попытка ${failures}/${MAX_ATTEMPTS}`)
      setBgStatus({ state: 'error', error: errorText(e), attempt: failures })
      if (!isRetryable(e) || failures >= MAX_ATTEMPTS) return
      try { await d.sleep(nextDelay(Math.max(1, failures)), signal) } catch { return setBgStatus({ state: isStopped(d.store) ? 'off' : 'idle' }) }
    }
  }
}

let current = null // { ctl, promise } — единственный запуск в этой вкладке

/** Запустить (один раз; повторный вызов вернёт идущий). Никогда не бросает. deps — подмена среды в тестах */
export function startBackground(deps = {}) {
  if (current) return current.promise
  const ctl = new AbortController()
  const promise = run(ctl.signal, deps)
    .catch(e => { pLog(`[vosk-bg] сбой планировщика: ${e?.message || e}`); setBgStatus({ state: 'error', error: errorText(e) }) })
    .finally(() => { if (current?.ctl === ctl) current = null })
  current = { ctl, promise }
  return promise
}

/** Остановить текущий запуск (флаг «стоп» не трогает). Вернёт промис, когда запуск реально закончился */
export function abortBackground() {
  const c = current
  if (!c) return Promise.resolve()
  c.ctl.abort()
  return c.promise
}

/** Админ: «Сбросить кэш модели» — остановить загрузку, стереть модель и куски, статус в начало; без флага «стоп» — запустить заново */
export async function resetBackgroundCache(deps = {}) {
  await abortBackground()
  await deleteModel(deps.cachesApi, deps.idb)
  await clearParts(deps.cachesApi)
  resetBgStatus()
  if (!isStopped(deps.store)) startBackground(deps)
}
