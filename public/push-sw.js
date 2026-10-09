// Сервис-воркер: push-уведомления + «прослойка» для установки на Android + офлайн-фолбэк загрузки страницы.
// Кэширует РОВНО ОДИН файл — /offline.html (кэш offline-v6); приложение, ассеты и API всегда идут с сервера,
// поэтому проверка свежего деплоя по номеру версии работает как раньше.
// Обработчик fetch — для Chrome на Android (сайты с fetch-обработчиком он ставит как WebAPK надёжнее) и для
// офлайна: ЗАГРУЗКА СТРАНИЦЫ (navigate) идёт в сеть, но НЕ ЖДЁТ её дольше NAV_TIMEOUT_MS: нет сети (navigator.onLine
// === false) — офлайн-страница сразу; сеть «есть, но молчит» (Wi-Fi без интернета: запрос висит ~10с и больше) —
// офлайн-страница через 4с (не 2.5с: холодный старт iPhone с «спящим» радио легко держит первый запрос 2-3с, и воркер подменял живую загрузку офлайн-страницей, которая сама перезагружалась — видимое «моргание» при запуске); ошибка сети — сразу. Раньше воркер ждал ошибку fetch, и iOS показывал белый экран
// ~10с. Офлайн-страница сама стучится в сеть и перезагружается, когда та ответила, и шлёт воркеру {type:'net-ok'} —
// тогда на PATIENT_MS ожидание страницы снимается до 15с (медленная, но живая сеть не зациклится). Если офлайн-страницы
// нет в кэше — ждём сеть как раньше. Всё остальное (видео, картинки, API, Supabase) не перехватывается.
// Меняешь offline.html — подними версию OFFLINE_CACHE (старые offline-* кэши чистятся при activate).

const OFFLINE_CACHE = 'offline-v6'
const OFFLINE_URL = '/offline.html'
const NAV_TIMEOUT_MS = 4000
const PATIENT_MS = 20000
const PATIENT_TIMEOUT_MS = 15000
let patientUntil = 0

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
  const wait = Date.now() < patientUntil ? PATIENT_TIMEOUT_MS : NAV_TIMEOUT_MS
  return new Promise(resolve => {
    let done = false
    const settle = res => { if (!done) { done = true; clearTimeout(timer); resolve(res) } }
    const timer = setTimeout(() => offlinePage().then(r => r && settle(r)).catch(() => {}), wait)
    fetch(request).then(settle, () => offlinePage().then(r => settle(r || Response.error())))
  })
}

self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') e.respondWith(navigate(e.request))
})

// Офлайн-страница сообщила, что сеть отвечает, — на время перестаём торопить загрузку страницы
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'net-ok') patientUntil = Date.now() + PATIENT_MS
})

self.addEventListener('install', e => e.waitUntil(cacheOffline().then(() => self.skipWaiting())))
self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('offline-') && k !== OFFLINE_CACHE).map(k => caches.delete(k))))
    .then(cacheOffline)
    .then(() => self.clients.claim())
))

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
