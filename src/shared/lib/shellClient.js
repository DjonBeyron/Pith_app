// Страница ↔ service worker (public/push-sw.js): кеш оболочки приложения («быстрый старт»). Регистрация воркера (после загрузки,
// чтобы предзагрузка кеша не мешала первому кадру), проверка новой версии (не чаще раза в 10 минут), сообщение о новой версии
// (плашка «Доступна новая версия»), boot-ok (страница смонтировалась — кеш не залип), сброс кеша при ошибке ленивого чанка и
// команды админки. Чистые части вынесены для тестов (shellClient.test.js). Автоматической перезагрузки здесь нет — только по тапу.

const UPDATE_GAP_MS = 10 * 60 * 1000
const REPLY_MS = 1500
const REGISTER_DELAY_MS = 800

const isToken = v => /^__.*__$/.test(v)
// BUILD_ID, с которым собрана ЭТА страница (meta в index.html); в dev токен не подставлен — null
export function ownBuild() {
  try {
    const v = document.querySelector('meta[name="pithy-build"]')?.content
    return v && !isToken(v) ? v : null
  } catch { return null }
}

export const shouldCheckUpdate = (now, last, gap = UPDATE_GAP_MS) => now - last >= gap
// Сообщение воркера о новой версии касается страницы, только если BUILD_ID воркера не совпадает с её собственным
export const isNewerBuild = (workerBuild, own) => !!workerBuild && !!own && workerBuild !== own

// Спросить воркера-контроллера и дождаться ответа (MessageChannel); null — воркера нет или он промолчал
export function askSw(message, timeout = REPLY_MS) {
  const controller = typeof navigator !== 'undefined' && navigator.serviceWorker?.controller
  if (!controller) return Promise.resolve(null)
  return new Promise(resolve => {
    const ch = new MessageChannel()
    const timer = setTimeout(() => resolve(null), timeout)
    ch.port1.onmessage = e => { clearTimeout(timer); resolve(e.data || null) }
    try { controller.postMessage(message, [ch.port2]) } catch { clearTimeout(timer); resolve(null) }
  })
}

let status = null
let lastCheck = 0
let announced = null
const subs = new Set()

// Статус кеша оболочки от воркера: { enabled, own, build, version, disabledUntil, caches, nav, ... } или null
export const getShellStatus = () => status
// Кеш оболочки включён и у воркера есть собственный полный кеш — тогда страница при перезагрузке придёт ИЗ КЕША
export const isShellActive = () => !!(status && status.enabled && status.own)
export async function refreshShellStatus() {
  const r = await askSw({ type: 'shell-status' })
  if (r && r.type === 'shell-status') status = r
  return status
}

// Подписка на «вышла новая версия, воркер уже поставил её кеш» (сработает и для подписавшегося позже)
export function onNewVersion(fn) {
  subs.add(fn)
  if (announced) fn(announced)
  return () => subs.delete(fn)
}
function announce(info) {
  if (announced) return
  announced = info
  subs.forEach(fn => fn(info))
}

// Попросить браузер проверить воркер (новый BUILD_ID → предзагрузка нового кеша). Не чаще UPDATE_GAP_MS, без сети не стучимся
export function checkForUpdate({ force = false } = {}) {
  const now = Date.now()
  if (!('serviceWorker' in navigator) || navigator.onLine === false) return
  if (!force && !shouldCheckUpdate(now, lastCheck)) return
  lastCheck = now
  navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {})
}

// Приложение смонтировалось (App.jsx): запуск удался — воркер сбрасывает счётчик неудачных запусков из кеша
export function confirmBoot() {
  try { navigator.serviceWorker?.controller?.postMessage({ type: 'boot-ok', buildId: ownBuild() }) } catch { /* без воркера — ок */ }
}

// Ленивый чанк не загрузился (lazyRetry): воркер сбрасывает кеш оболочки, затем перезагрузка идёт с сети. Ждём ответа недолго
export async function purgeShellAndReload() {
  await askSw({ type: 'purge-shell' }, 2000)
  window.location.reload()
}

// Команды админки (Админ → «Старт» → «Быстрый старт»): ответ воркера — новый статус
export async function shellCommand(type, extra = {}, timeout = REPLY_MS) {
  const r = await askSw({ type, ...extra }, timeout)
  if (r && r.type === 'shell-status') status = r
  return r
}

export function initShellClient() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  const sw = navigator.serviceWorker
  const hadController = !!sw.controller
  sw.addEventListener('message', e => {
    const d = e.data
    if (d && d.type === 'new-version' && isNewerBuild(d.buildId, ownBuild())) announce(d)
  })
  // Запасной путь: сообщение потерялось, но воркер сменился — сверяем BUILD_ID воркера со своим
  sw.addEventListener('controllerchange', () => {
    if (!hadController) return
    refreshShellStatus().then(s => { if (s && isNewerBuild(s.build, ownBuild())) announce({ buildId: s.build, version: s.version }) })
  })
  if (hadController) refreshShellStatus()
  // Регистрируем после загрузки: install воркера качает все файлы сборки и не должен мешать первому кадру
  const start = () => setTimeout(() => {
    sw.register('/push-sw.js').then(() => { if (hadController) checkForUpdate({ force: true }) }).catch(() => {})
  }, REGISTER_DELAY_MS)
  if (document.readyState === 'complete') start()
  else window.addEventListener('load', start, { once: true })
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate() })
}
