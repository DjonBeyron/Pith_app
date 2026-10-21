// Лабораторный service worker ЛАБ-7 («Лаборатория запуска», Админ → «Старт»), scope /startlab/l7/: БЕЗ fetch-обработчика.
// Ничего не перехватывает — страница идёт из HTTP-кеша браузера (max-age в vercel.json), как и ЛАБ-6. Проверяет, поднимает ли iOS
// воркер без fetch при навигации (браузеры с оптимизацией «нет fetch-обработчика» его не трогают) — это будущее приложения,
// если воркер оставить только для пушей. Слушатель push — чтобы воркер был «настоящим» (как push-sw.js), сам ничего не показывает.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))
self.addEventListener('push', () => { /* лаборатория: пуши не показываем */ })
