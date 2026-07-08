// Сервис-воркер ТОЛЬКО для push-уведомлений. Намеренно без обработчика fetch
// и без какого-либо кэширования: приложение всегда грузится с сервера, и
// проверка свежего деплоя по номеру версии продолжает работать как раньше.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

// Пуш от сервера: payload — JSON { title, body, url }
self.addEventListener('push', e => {
  let data = {}
  try { data = e.data ? e.data.json() : {} } catch { /* нет payload — покажем дефолт */ }
  const title = data.title || 'Pithy'
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
  const url = e.notification.data?.url || '/'
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const open = list.find(c => 'focus' in c)
      if (open) { open.navigate(url); return open.focus() }
      return self.clients.openWindow(url)
    })
  )
})
