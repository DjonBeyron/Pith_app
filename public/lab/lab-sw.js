// Лабораторный сервис-воркер для ЛАБ-5 («Лаборатория запуска», Админ → «Старт»). Scope — только /lab/ (скрипт лежит в /lab/,
// поэтому заголовок Service-Worker-Allowed не обязателен; в vercel.json он всё равно стоит). Основной push-sw.js пути /lab/ не трогает.
// Делает ровно одно: кладёт /lab/l5.html в кеш при установке и отдаёт его на навигации СРАЗУ из кеша (cache-first),
// а свежую копию подтягивает в фоне. Всё остальное (ЛАБ-1…4, список, картинки) не перехватывает — идёт в сеть как есть.
// Цель: убрать TTFB (770–1059 мс до первого байта в журналах старта) и проверить, из-за него ли моргает iOS.
const CACHE = 'lab-l5-v1'
const PAGE = '/lab/l5.html'

const fresh = () => caches.open(CACHE).then(c => c.add(new Request(PAGE, { cache: 'reload' })))

self.addEventListener('install', e => e.waitUntil(fresh().catch(() => {}).then(() => self.skipWaiting())))
self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('lab-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
))

self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate' || new URL(e.request.url).pathname !== PAGE) return
  e.respondWith(
    caches.match(PAGE, { cacheName: CACHE }).then(hit => {
      if (!hit) return fetch(e.request)
      e.waitUntil(fresh().catch(() => {}))
      return hit
    })
  )
})
