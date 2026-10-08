// Общий хелпер «приложение ушло в фон / под системную шторку» для всего, что крутит rAF и держит большие холсты облачков
// (плавание — usePhraseBubbleFloat.js, взрыв — usePhraseBubbleExplode.js). Бисекция на iPhone показала: даже спящие холсты
// и работающий rAF делают дёрганым сворачивание приложения и шторки/центр управления iOS — а в этот момент visibilitychange
// приходит не всегда (шторка даёт только window blur), поэтому слушаем всё сразу:
//   скрыто: document visibilitychange (hidden), document freeze, window pagehide, window blur;
//   вернулось: document visibilitychange (visible), document resume, window pageshow, window focus.
// watchAppLifecycle(onHide, onShow) → отписка. Колбэки зовутся ТОЛЬКО на смене состояния (повторные blur/pagehide подряд —
// один onHide; onShow без предыдущего onHide не зовётся), «вернулось» игнорируется, пока документ ещё hidden (focus при
// скрытой вкладке). Начальное состояние берётся из документа: подписались, когда страница уже hidden — onShow придёт при
// возврате, а вызывающий сам не запускает цикл (isAppAway()). Подписку держат только пока облачка живы (эффект цикла
// плавания / взрыва) и снимают в cleanup — на остальных слайдах слушателей нет.
export const isAppAway = (doc = document) => doc.visibilityState === 'hidden'

export function watchAppLifecycle(onHide, onShow, { doc = document, win = window } = {}) {
  let away = isAppAway(doc)
  const hide = () => {
    if (away) return
    away = true
    onHide()
  }
  const show = () => {
    if (!away || isAppAway(doc)) return
    away = false
    onShow()
  }
  const onVisibility = () => (isAppAway(doc) ? hide() : show())
  const subs = [
    [doc, 'visibilitychange', onVisibility],
    [doc, 'freeze', hide],
    [doc, 'resume', show],
    [win, 'pagehide', hide],
    [win, 'pageshow', show],
    [win, 'blur', hide],
    [win, 'focus', show],
  ]
  for (const [target, name, fn] of subs) target.addEventListener(name, fn)
  return () => { for (const [target, name, fn] of subs) target.removeEventListener(name, fn) }
}
