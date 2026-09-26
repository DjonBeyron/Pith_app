// Просьба открыть схему модуля из любого места приложения (мостик
// «Продолжить фразу» в итоге повторения): ShellV2 переключает вкладку на
// «Уроки», FeedTab открывает модуль — тот же экран, что после «Изучить фразу».
const EVENT = 'pithy:open-module'

// module: { id, title }
export function requestOpenModule(module) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: module }))
}

export function onOpenModule(fn) {
  const h = e => fn(e.detail)
  window.addEventListener(EVENT, h)
  return () => window.removeEventListener(EVENT, h)
}
