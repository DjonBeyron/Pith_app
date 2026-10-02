// Сервис-воркер: push-уведомления + пустая «прослойка» для установки на Android. Ничего не кэширует:
// приложение всегда грузится с сервера, и проверка свежего деплоя по номеру версии работает как раньше.
// Обработчик fetch ниже — для Chrome на Android: сайты с fetch-обработчиком он ставит как приложение (WebAPK)
// надёжнее; раньше воркер был «намеренно без fetch», а «Установить» из меню на части телефонов ничего не делало
// (остаётся только ярлык). Он пропускает ЗАГРУЗКУ СТРАНИЦ (navigate) в сеть как есть, всё остальное (видео, картинки,
// API) не перехватывает вовсе — браузер грузит само.

self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') e.respondWith(fetch(e.request))
})

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

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
