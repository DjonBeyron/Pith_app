// Обёртка для React.lazy: после деплоя старые chunk-хэши отдают 404, и
// import() у пользователей с открытой вкладкой падает. Лечение — один раз
// перезагрузить страницу (флаг в sessionStorage, чтобы не зациклиться).
export function lazyRetry(importFn, key) {
  return importFn().catch(err => {
    const k = `pithy_lazy_reload_${key}`
    if (!sessionStorage.getItem(k)) {
      sessionStorage.setItem(k, '1')
      window.location.reload()
    }
    throw err
  })
}
