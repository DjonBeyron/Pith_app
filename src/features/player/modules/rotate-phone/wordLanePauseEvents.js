// Какие события считаются «приложение ушло» для паузы игры (useWordLanePause). iOS 18 при блокировке экрана и некоторых переключениях приложений иногда НЕ шлёт visibilitychange → hidden (v3.3.115, пункт 8
// замечаний владельца: «после сворачивания игра беззвучна, пауза срабатывает не всегда»). Поэтому слушаем четыре сигнала, любой ставит паузу:
//  • visibilitychange (hidden) и pagehide — как раньше;
//  • freeze (Page Lifecycle: страницу заморозили) — приходит без hidden в части сборок;
//  • blur окна — только если ~BLUR_CONFIRM_MS спустя вкладка так и не вернула фокус (document.hasFocus() === false) или уже hidden: короткий blur (системная шторка, диалог) паузу не ставит.
//  • НО blur во время нашего запроса микрофона (getUserMedia ждёт ответа и ещё 1,5 с после — gameMicRequest.js) — не уход: это системный диалог доступа. Раньше пауза ставилась посреди «Продолжить»,
//    закрывала сессию и только что открытый микрофон (журнал владельца v3.3.146: «поток открылся уже после закрытия игры»). hidden / pagehide / freeze считаются всегда.
// onHide(why) зовётся на каждый сигнал; «один раз за уход» держит вызывающий (useWordLanePause). Чистая функция подписки: документ, окно и таймеры подставляются в тестах. → отписка.
import { micRequestPending } from '../../../../shared/lib/gameMicRequest.js'
import { pLog } from '../../../../shared/lib/debug.js'

export const BLUR_CONFIRM_MS = 250
const MIC_BLUR_LINE = '[pause] blur во время запроса микрофона — не пауза'

export function subscribePauseEvents(onHide, { doc = typeof document !== 'undefined' ? document : null, win = typeof window !== 'undefined' ? window : null, setTimer = setTimeout, clearTimer = clearTimeout, micBusy = micRequestPending, log = pLog } = {}) {
  if (!doc || !win) return () => {}
  let blurTimer = 0
  const cancelBlur = () => { clearTimer(blurTimer); blurTimer = 0 }
  const onVis = () => { if (doc.visibilityState === 'hidden') onHide('hidden') }
  const onPageHide = () => onHide('pagehide')
  const onFreeze = () => onHide('freeze')
  const onBlur = () => {
    cancelBlur()
    if (micBusy()) { log(MIC_BLUR_LINE); return }
    blurTimer = setTimer(() => {
      blurTimer = 0
      if (doc.visibilityState === 'hidden') { onHide('blur'); return } // ушли по-настоящему (hidden мог не прийти отдельным событием)
      if (doc.hasFocus?.() !== false) return
      if (micBusy()) { log(MIC_BLUR_LINE); return } // диалог доступа ещё на экране или только что уехал
      onHide('blur')
    }, BLUR_CONFIRM_MS)
  }
  doc.addEventListener('visibilitychange', onVis); doc.addEventListener('freeze', onFreeze)
  win.addEventListener('pagehide', onPageHide); win.addEventListener('blur', onBlur); win.addEventListener('focus', cancelBlur)
  return () => {
    cancelBlur()
    doc.removeEventListener('visibilitychange', onVis); doc.removeEventListener('freeze', onFreeze)
    win.removeEventListener('pagehide', onPageHide); win.removeEventListener('blur', onBlur); win.removeEventListener('focus', cancelBlur)
  }
}
