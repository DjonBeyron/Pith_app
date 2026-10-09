import { purgeShellAndReload } from './shellClient.js'

// Обёртка для React.lazy: после деплоя старые chunk-хэши отдают 404, и
// import() у пользователей с открытой вкладкой падает. Лечение — один раз
// перезагрузить страницу (флаг в sessionStorage, чтобы не зациклиться).
// Перед перезагрузкой просим service worker сбросить кеш оболочки (purge-shell, shellClient.js): иначе reload отдал бы
// ту же устаревшую страницу из кеша, а с сети придёт свежая; без воркера — обычный reload.
// Без сети перезагрузка бессмысленна (страница не загрузится) — тогда просто
// пробрасываем ошибку: ErrorBoundary покажет NetworkProblem («Нет подключения»)
export function lazyRetry(importFn, key) {
  return importFn().catch(err => {
    const k = `pithy_lazy_reload_${key}`
    if (navigator.onLine !== false && !sessionStorage.getItem(k)) {
      sessionStorage.setItem(k, '1')
      if (navigator.serviceWorker?.controller && !sessionStorage.getItem('pithy_shell_purge_v1')) {
        sessionStorage.setItem('pithy_shell_purge_v1', '1') // сброс кеша оболочки — не чаще раза за сессию
        purgeShellAndReload()
      } else window.location.reload()
    }
    throw err
  })
}
