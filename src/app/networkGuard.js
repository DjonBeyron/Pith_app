// Чистая логика «что показать вместо белого экрана без сети».
// ЗЕРКАЛО: public/net-guard.js (ES5, грузится синхронно в <head> и должен работать, даже когда бандл не загрузился)
// дублирует decideNetworkState и константы ниже. Меняешь здесь — меняй там (networkGuard.test.js сверяет оба).

// «Слабое соединение» показываем не сразу, а через паузу — чтобы не мигало при медленной, но живой сети
export const SLOW_SHOW_DELAY_MS = 2500
// Приложение не смонтировалось за это время — считаем, что бандл не доехал
export const BOOT_TIMEOUT_MS = 8000

// 'offline' — сети нет (показываем сразу); 'slow' — сеть есть, но ресурсы не грузятся; 'none' — ничего не показываем
//   online — navigator.onLine; mounted — приложение уже нарисовалось в #root;
//   resourceFailedMs — сколько мс прошло с первой ошибки загрузки скрипта/стиля приложения (null — ошибок не было);
//   elapsedMs — сколько мс прошло со старта страницы
export function decideNetworkState({ online, mounted, resourceFailedMs = null, elapsedMs = 0 }) {
  if (mounted) return 'none'
  if (online === false) return 'offline'
  if (resourceFailedMs !== null && resourceFailedMs >= SLOW_SHOW_DELAY_MS) return 'slow'
  if (elapsedMs >= BOOT_TIMEOUT_MS) return 'slow'
  return 'none'
}

// Что написать на экране, когда загрузка уже сорвалась внутри работающего приложения (ленивый чанк)
export function networkKindNow() {
  return typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'slow'
}

// Тексты экрана «нет связи» (тон приложения — на «ты»). ЗЕРКАЛА: public/net-guard.js (TEXTS) и public/offline.html
// (скрипт sync) — копии строк, networkGuard.test.js сверяет их с этим объектом. Менять парно.
export const NETWORK_TEXTS = {
  offline: { title: 'Нет подключения', text: 'Проверь соединение с интернетом. Как только оно появится, мы продолжим' },
  slow: { title: 'Слабое соединение', text: 'Проверь соединение с интернетом — мы продолжим сами' },
  retry: 'Повторить',
}

// Ошибка загрузки ленивого модуля (React.lazy / import()): текст зависит от браузера
const CHUNK_RE = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed|Loading CSS chunk [\w-]+ failed/i
export function isChunkLoadError(err) {
  if (!err) return false
  if (err.name === 'ChunkLoadError') return true
  return CHUNK_RE.test(String(err.message ?? err))
}
