// Сервис-воркер: push-уведомления + «прослойка» для установки на Android + офлайн-фолбэк загрузки страницы.
// Кэширует РОВНО ОДИН файл — /offline.html (кэш offline-v1); приложение, ассеты и API всегда идут с сервера,
// поэтому проверка свежего деплоя по номеру версии работает как раньше.
// Обработчик fetch — для Chrome на Android (сайты с fetch-обработчиком он ставит как WebAPK надёжнее) и для
// офлайна: ЗАГРУЗКА СТРАНИЦЫ (navigate) идёт в сеть как есть, а если сети нет — вместо белого/системного экрана
// iOS показываем закешированный /offline.html. Всё остальное (видео, картинки, API, Supabase) не перехватывается.
// Меняешь offline.html — подними версию OFFLINE_CACHE (старые offline-* кэши чистятся при activate).

const OFFLINE_CACHE = 'offline-v1'
const OFFLINE_URL = '/offline.html'

// Кладём офлайн-страницу в кэш; ошибка (например, сети нет в момент установки) не ломает установку воркера
const cacheOffline = () =>
  caches.open(OFFLINE_CACHE)
    .then(c => c.match(OFFLINE_URL).then(hit => hit || c.add(new Request(OFFLINE_URL, { cache: 'reload' }))))
    .catch(() => {})

self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match(OFFLINE_URL, { cacheName: OFFLINE_CACHE }).then(r => r || Response.error())
      )
    )
  }
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
