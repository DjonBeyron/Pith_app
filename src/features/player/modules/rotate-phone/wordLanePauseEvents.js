// Какие события считаются «приложение ушло» для паузы игры (useWordLanePause). iOS 18 при блокировке экрана и некоторых переключениях приложений иногда НЕ шлёт visibilitychange → hidden (v3.3.115, пункт 8
// замечаний владельца: «после сворачивания игра беззвучна, пауза срабатывает не всегда»). Поэтому слушаем четыре сигнала, любой ставит паузу:
//  • visibilitychange (hidden) и pagehide — как раньше;
//  • freeze (Page Lifecycle: страницу заморозили) — приходит без hidden в части сборок;
//  • blur окна — только если ~BLUR_CONFIRM_MS спустя вкладка так и не вернула фокус (document.hasFocus() === false) или уже hidden: короткий blur (системная шторка, диалог) паузу не ставит.
// onHide(why) зовётся на каждый сигнал; «один раз за уход» держит вызывающий (useWordLanePause). Чистая функция подписки: документ, окно и таймеры подставляются в тестах. → отписка.
export const BLUR_CONFIRM_MS = 250

export function subscribePauseEvents(onHide, { doc = typeof document !== 'undefined' ? document : null, win = typeof window !== 'undefined' ? window : null, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (!doc || !win) return () => {}
  let blurTimer = 0
  const cancelBlur = () => { clearTimer(blurTimer); blurTimer = 0 }
  const onVis = () => { if (doc.visibilityState === 'hidden') onHide('hidden') }
  const onPageHide = () => onHide('pagehide')
  const onFreeze = () => onHide('freeze')
  const onBlur = () => {
    cancelBlur()
    blurTimer = setTimer(() => { blurTimer = 0; if (doc.visibilityState === 'hidden' || doc.hasFocus?.() === false) onHide('blur') }, BLUR_CONFIRM_MS)
  }
  doc.addEventListener('visibilitychange', onVis); doc.addEventListener('freeze', onFreeze)
  win.addEventListener('pagehide', onPageHide); win.addEventListener('blur', onBlur); win.addEventListener('focus', cancelBlur)
  return () => {
    cancelBlur()
    doc.removeEventListener('visibilitychange', onVis); doc.removeEventListener('freeze', onFreeze)
    win.removeEventListener('pagehide', onPageHide); win.removeEventListener('blur', onBlur); win.removeEventListener('focus', cancelBlur)
  }
}
