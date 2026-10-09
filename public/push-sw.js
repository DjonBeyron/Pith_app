// Сервис-воркер: push-уведомления + «прослойка» для установки на Android + офлайн-фолбэк + КЕШ ОБОЛОЧКИ (быстрый старт).
// КЕШ ОБОЛОЧКИ (shell-<BUILD_ID>): index.html и все файлы сборки (/assets/*, net-guard.js, манифест, иконки) кладутся в ОДИН
// версионный кеш при install (атомарно: не загрузился хоть один файл — кеш удаляется, остаётся прежний). Навигация на «/»
// отдаётся из кеша СРАЗУ (TTFB ≈ 3 мс вместо 0.8 с сети — это и есть окно «моргания» iOS между нативной картинкой и первым
// кадром), /assets/* — cache-first. Новая версия подхватывается так: новый воркер (другой BUILD_ID) предзагружает свой кеш →
// skipWaiting + clients.claim → шлёт страницам {type:'new-version'} → плашка «Доступна новая версия» → по тапу reload.
// Остаются максимум 2 кеша (текущий и предыдущий: открытая страница старой версии не теряет ленивые чанки).
// Защита от залипания: ?nosw=1, флаг «выключено на 24 ч», boot-ok (два запуска из кеша без boot-ok → выключаем), purge-shell
// (ленивый чанк не загрузился). Логика решений — в sw-core.js (тесты: swCore.test.js). BUILD_ID/APP_VER/PRECACHE подставляет
// vite-плагин при сборке (tools/viteShellCache.js); в dev и тестах остаются токены — кеш оболочки ВЫКЛЮЧЕН, воркер как раньше.
// Без кеша оболочки: ЗАГРУЗКА СТРАНИЦЫ (navigate) идёт в сеть, но НЕ ЖДЁТ её дольше NAV_TIMEOUT_MS: нет сети (navigator.onLine
// === false) — офлайн-страница сразу; сеть «есть, но молчит» (Wi-Fi без интернета: запрос висит ~10с и больше) —
// офлайн-страница через 4с (не 2.5с: холодный старт iPhone с «спящим» радио легко держит первый запрос 2-3с, и воркер подменял живую загрузку офлайн-страницей, которая сама перезагружалась — видимое «моргание» при запуске); ошибка сети — сразу. Раньше воркер ждал ошибку fetch, и iOS показывал белый экран
// ~10с. Офлайн-страница сама стучится в сеть и перезагружается, когда та ответила, и шлёт воркеру {type:'net-ok'} —
// тогда на PATIENT_MS ожидание страницы снимается до 15с (медленная, но живая сеть не зациклится). Если офлайн-страницы
// нет в кэше — ждём сеть как раньше. Видео, картинки, API, Supabase, шрифты не перехватываются.
// Пути /lab/ («Лаборатория запуска», Админ → «Старт») воркер НЕ перехватывает: у них свой lab-sw.js и чистый эксперимент без нашей навигации.
// Меняешь offline.html — подними версию OFFLINE_CACHE (старые offline-* кэши чистятся при activate).

self.importScripts('/sw-core.js')
const Core = self.PithySwCore

const OFFLINE_CACHE = 'offline-v7'
const OFFLINE_URL = '/offline.html'
const NAV_TIMEOUT_MS = 4000
const PATIENT_MS = 20000
const PATIENT_TIMEOUT_MS = 15000
let patientUntil = 0

const BUILD_ID = '__BUILD_ID__'
const APP_VER = '__APP_VERSION__'
const PRECACHE = '__PRECACHE__'
const ON = Core.configured(BUILD_ID, PRECACHE)
const SHELL = ON ? Core.cacheName(BUILD_ID) : ''
const STATICS = new Set(ON ? PRECACHE.filter(u => u !== '/' && !u.startsWith('/assets/')) : [])
const wait = ms => new Promise(r => setTimeout(r, ms))

// Кладём офлайн-страницу в кэш; ошибка (например, сети нет в момент установки) не ломает установку воркера
const cacheOffline = () =>
  caches.open(OFFLINE_CACHE)
    .then(c => c.match(OFFLINE_URL).then(hit => hit || c.add(new Request(OFFLINE_URL, { cache: 'reload' }))))
    .catch(() => {})

const offlinePage = () => caches.match(OFFLINE_URL, { cacheName: OFFLINE_CACHE })

// Страница: сеть или (по таймауту / ошибке / отсутствию сети) офлайн-страница
function navigate(request) {
  if (self.navigator.onLine === false) {
    return offlinePage().then(r => r || fetch(request))
  }
  const waitMs = Date.now() < patientUntil ? PATIENT_TIMEOUT_MS : NAV_TIMEOUT_MS
  return new Promise(resolve => {
    let done = false
    const settle = res => { if (!done) { done = true; clearTimeout(timer); resolve(res) } }
    const timer = setTimeout(() => offlinePage().then(r => r && settle(r)).catch(() => {}), waitMs)
    fetch(request).then(settle, () => offlinePage().then(r => settle(r || Response.error())))
  })
}

// ───── состояние кеша оболочки (флаг отключения, счётчик неудачных запусков, последняя навигация) — в Cache API ─────
let state = null
let stateP = null
let writeP = Promise.resolve()
const readState = () => caches.match(Core.STATE_KEY, { cacheName: Core.STATE_CACHE })
  .then(r => (r ? r.json() : null)).catch(() => null).then(Core.normState)
const loadState = () => stateP || (stateP = readState().then(s => (state = s)))
const saveState = () => (writeP = writeP
  .then(() => caches.open(Core.STATE_CACHE).then(c => c.put(Core.STATE_KEY, new Response(JSON.stringify(state), { headers: { 'content-type': 'application/json' } }))))
  .catch(() => {}))

// ───── кеш оболочки ─────
const markOf = name => caches.match(Core.MARK_KEY, { cacheName: name }).then(r => (r ? r.json() : null)).catch(() => null)
let precaching = null
function precacheShell() {
  if (precaching) return precaching
  precaching = (async () => {
    if (await markOf(SHELL)) return // уже полный (пересборка воркера без изменений файлов)
    await caches.delete(SHELL)
    const cache = await caches.open(SHELL)
    const queue = Core.precacheOrder(PRECACHE)
    let failed = null
    const worker = async () => {
      for (let u = queue.shift(); u !== undefined && !failed; u = queue.shift()) {
        const res = await fetch(new Request(u, { cache: Core.fetchMode(u) }))
        if (!Core.validPrecache(u, { ok: res.ok, redirected: res.redirected, ct: res.headers.get('content-type') })) throw new Error('precache ' + u + ' ' + res.status)
        // страница из сети обязана быть ЭТОЙ сборки (метка BUILD_ID в index.html): иначе устаревший ответ CDN положил бы в новый кеш старую страницу
        if (u === Core.SHELL_KEY && !(await res.clone().text()).includes(BUILD_ID)) throw new Error('precache: index.html другой сборки')
        await cache.put(u, res)
      }
    }
    try {
      await Promise.all([1, 2, 3, 4].map(() => worker().catch(err => { failed = failed || err })))
      if (failed) throw failed
      await cache.put(Core.MARK_KEY, new Response(JSON.stringify({ build: BUILD_ID, ver: APP_VER, at: Date.now(), n: PRECACHE.length }), { headers: { 'content-type': 'application/json' } }))
    } catch (err) { await caches.delete(SHELL); throw err }
  })().finally(() => { precaching = null })
  return precaching
}

const shellNames = () => caches.keys().then(ks => ks.filter(Core.isShellName))
const purgeShell = () => shellNames().then(ns => Promise.all(ns.map(n => caches.delete(n))))
async function rotateShell() {
  const names = await shellNames()
  const stamps = {}
  await Promise.all(names.map(async n => { const m = await markOf(n); stamps[n] = m ? m.at || 1 : null }))
  await Promise.all(Core.planRotation(names, SHELL, stamps).map(n => caches.delete(n)))
}

// Статус для админки («Быстрый старт») и журнала старта
async function statusReply() {
  const st = await loadState()
  const names = await shellNames()
  const list = await Promise.all(names.map(async n => ({ name: n, mark: await markOf(n) })))
  return Core.statusView({
    configured: ON, build: BUILD_ID, version: APP_VER, state: st, now: Date.now(), own: list.some(i => i.name === SHELL && i.mark),
    caches: list.map(i => ({ name: i.name, own: i.name === SHELL, ver: i.mark && i.mark.ver, at: i.mark && i.mark.at, n: i.mark && i.mark.n, full: !!i.mark })),
  })
}

// ───── навигация на страницу приложения ─────
// Фоновая сверка: сеть отдала другой index.html — ничего не подменяем сейчас, а просим браузер проверить воркер (новый BUILD_ID → новый кеш)
async function revalidate(cached) {
  await wait(1500)
  const fresh = await fetch(new Request('/', { cache: 'no-cache' }))
  if (!fresh.ok) return
  const [a, b] = await Promise.all([cached.text(), fresh.text()])
  if (a !== b) await self.registration.update()
}

async function shellNav(e, work) {
  const t0 = Date.now()
  const url = new URL(e.request.url)
  const [st, hit, mark] = await Promise.all([loadState(), caches.match(Core.SHELL_KEY, { cacheName: SHELL, ignoreSearch: true, ignoreVary: true }), markOf(SHELL)])
  const d = Core.decideNav({ configured: ON, buildId: BUILD_ID, search: url.search, state: st, now: t0, online: self.navigator.onLine, hasShell: !!(hit && mark) })
  if (d.disableFor) Core.disableState(st, t0, d.disableFor, d.why)
  if (d.purge) work.push(purgeShell())
  const shell = d.mode === 'shell'
  if (shell) st.pending = { build: BUILD_ID, at: t0 }
  st.nav = { source: shell ? 'cache' : 'network', why: d.why, build: BUILD_ID, ms: Date.now() - t0, at: t0, cid: e.resultingClientId || '' }
  work.push(saveState())
  if (!shell) {
    if (d.ensure) work.push(wait(5000).then(precacheShell).catch(() => {})) // кеша нет (стёрт/не успел) — пересобираем уже после загрузки страницы
    return navigate(e.request)
  }
  work.push(revalidate(hit.clone()).catch(() => {}))
  const headers = new Headers(hit.headers)
  headers.set('X-Pithy-Shell', BUILD_ID)
  headers.delete('content-encoding') // тело в кеше уже распаковано: заголовок про сжатие страницу бы только запутал
  headers.delete('content-length')
  return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers })
}

function handleNav(e) {
  let release
  e.waitUntil(new Promise(r => { release = r })) // воркер живёт, пока идут фоновые задачи (запись состояния, сверка, purge)
  const work = []
  // ВАЖНО: finally не должен возвращать промис — иначе ответ страницы будет ждать фоновые задачи
  e.respondWith(shellNav(e, work).catch(() => navigate(e.request)).finally(() => { Promise.allSettled(work).then(release) }))
}

// /assets/* (хешированные, неизменные) и статика из предзагрузки: cache-first из кеша оболочки (в т.ч. предыдущего), промах — сеть
async function resource(e, kind) {
  const st = await loadState()
  if (!Core.shellActive(st, Date.now())) return fetch(e.request)
  const hit = await caches.match(e.request, kind === 'static' ? { cacheName: SHELL, ignoreSearch: true, ignoreVary: true } : { ignoreVary: true })
  if (hit) return hit
  const res = await fetch(e.request)
  if (kind === 'asset' && res.ok && !res.redirected && await markOf(SHELL)) {
    const copy = res.clone()
    const put = caches.open(SHELL).then(c => c.put(e.request, copy)).catch(() => {})
    try { e.waitUntil(put) } catch { /* событие уже завершено — запись всё равно идёт */ }
  }
  return res
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (url.pathname.startsWith('/lab/')) return // лаборатория запуска: ранний выход, без перехвата
  const kind = Core.route({ pathname: url.pathname, search: url.search, sameOrigin: url.origin === self.location.origin, method: e.request.method, mode: e.request.mode, cache: e.request.cache }, STATICS)
  if (kind === 'shell-nav' && ON) handleNav(e)
  else if (e.request.mode === 'navigate') e.respondWith(navigate(e.request))
  else if (ON && (kind === 'asset' || kind === 'static')) e.respondWith(resource(e, kind))
})

// ───── сообщения страниц ─────
// net-ok — офлайн-страница: сеть отвечает, на время перестаём торопить загрузку страницы; boot-ok — приложение смонтировалось (кеш оболочки не залип); shell-status — статус для
// админки/журнала; purge-shell — ленивый чанк не загрузился, сбросить кеш; shell-disable/shell-enable — кнопки админки
self.addEventListener('message', e => {
  const d = e.data || {}
  const reply = async make => {
    const msg = await make().catch(err => ({ type: 'error', error: String(err && err.message || err) }))
    try { (e.ports && e.ports[0] ? e.ports[0] : e.source).postMessage(msg) } catch { /* страницы уже нет */ }
  }
  if (d.type === 'net-ok') patientUntil = Date.now() + PATIENT_MS
  else if (!ON) { if (e.ports && e.ports[0]) e.waitUntil(reply(statusReply)) }
  else if (d.type === 'boot-ok') e.waitUntil(loadState().then(st => (Core.confirmBoot(st, d.buildId) ? saveState() : null)))
  else if (d.type === 'shell-status') e.waitUntil(reply(statusReply))
  else if (d.type === 'purge-shell') {
    e.waitUntil(reply(async () => {
      const st = await loadState()
      if (!d.rebuild) Core.blockBuild(st, BUILD_ID, Date.now()) // rebuild: кнопка админки — кеш пересоберётся сам на следующем запуске
      await Promise.all([purgeShell(), saveState()])
      self.registration.update().catch(() => {}) // новая сборка (если есть) поставит свежий кеш
      return statusReply()
    }))
  } else if (d.type === 'shell-disable') {
    e.waitUntil(reply(async () => {
      const st = await loadState()
      Core.disableState(st, Date.now(), (+d.hours || 24) * 3600 * 1000, 'manual')
      await Promise.all([purgeShell(), saveState()])
      return statusReply()
    }))
  } else if (d.type === 'shell-enable') {
    e.waitUntil(reply(async () => {
      Core.enableState(await loadState())
      await saveState()
      await precacheShell()
      return statusReply()
    }))
  }
})

self.addEventListener('install', e => e.waitUntil((async () => {
  await cacheOffline()
  if (ON) {
    const st = await readState()
    const now = Date.now()
    if (!Core.isDisabled(st, now) && !Core.isBlocked(st, BUILD_ID, now)) {
      // не загрузилось — НОВЫЙ воркер не ставим, пока есть прежний кеш (атомарность); на чистом устройстве воркер важнее кеша
      try { await precacheShell() } catch (err) { if ((await shellNames()).length) throw err }
    }
  }
  await self.skipWaiting()
})()))

self.addEventListener('activate', e => e.waitUntil((async () => {
  const keys = await caches.keys()
  await Promise.all(keys.filter(k => k.startsWith('offline-') && k !== OFFLINE_CACHE).map(k => caches.delete(k)))
  await cacheOffline()
  if (ON) await rotateShell().catch(() => {})
  await self.clients.claim()
  // Страницы с другим BUILD_ID (открытая старая версия) покажут плашку «Доступна новая версия»; тот же BUILD_ID страница игнорирует
  const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  list.forEach(c => c.postMessage({ type: 'new-version', buildId: BUILD_ID, version: APP_VER }))
})()))

// Пуш от сервера: payload — JSON { title, body, url }
self.addEventListener('push', e => {
  let data = {}
  try { data = e.data ? e.data.json() : {} } catch { /* нет payload — покажем дефолт */ }
  const title = data.title || 'HETA'
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' },
  }))
})

// Тап по уведомлению: фокусируем открытое приложение или открываем новое окно
self.addEventListener('notificationclick', e => {
  e.notification.close()
  // ?from=push — метка для аналитики (push_open, analytics/track.js),
  // приложение считает её и сразу убирает из адреса
  const target = new URL(e.notification.data?.url || '/', self.location.origin)
  target.searchParams.set('from', 'push')
  const url = target.href
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const open = list.find(c => 'focus' in c)
      if (open) { open.navigate(url); return open.focus() }
      return self.clients.openWindow(url)
    })
  )
})
