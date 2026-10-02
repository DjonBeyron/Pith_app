import { fdbg } from './feedDebug.js'

// Сторож жестов (отчёт DBG): жалоба — на Android в модуле уроков палец, попавший на блок, не листает схему. Для каждого
// свайпа (≥ 24 px) пишем, на каком элементе он начался, какой у того touch-action, какой прокручиваемый контейнер был
// над ним, сдвинулся ли он за жест, прервал ли браузер жест (pointercancel — браузер забрал его себе под прокрутку) и
// не отменял ли кто-то touchmove (preventDefault — тогда прокрутки не будет). По строкам видно, где именно жест «глохнет»
const MIN_SWIPE_PX = 24

const label = el => {
  if (!el) return 'нет'
  const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : ''
  return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`
}

// Ближайший вертикально прокручиваемый предок, у которого есть что прокручивать
function scrollerOf(el) {
  for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
    const oy = getComputedStyle(e).overflowY
    if ((oy === 'auto' || oy === 'scroll') && e.scrollHeight > e.clientHeight + 1) return e
  }
  return null
}

export function startTouchWatch() {
  let g = null
  document.addEventListener('touchstart', e => {
    const p = e.touches[0]
    const target = e.target instanceof Element ? e.target : null
    if (!p || e.touches.length > 1 || !target) { g = null; return }
    const sc = scrollerOf(target)
    g = { y: p.clientY, target, sc, top0: sc ? sc.scrollTop : 0, canceled: false, prevented: false }
  }, { capture: true, passive: true })
  document.addEventListener('pointercancel', () => { if (g) g.canceled = true }, true)
  window.addEventListener('touchmove', e => { if (g && e.defaultPrevented) g.prevented = true }, { passive: true })
  document.addEventListener('touchend', e => {
    const cur = g
    g = null
    const p = e.changedTouches[0]
    if (!cur || !p || Math.abs(p.clientY - cur.y) < MIN_SWIPE_PX) return
    const dy = Math.round(p.clientY - cur.y)
    // Инерция после отпускания ещё идёт — замеряем сдвиг чуть позже
    setTimeout(() => {
      const ta = cur.target.isConnected ? getComputedStyle(cur.target).touchAction : '-'
      fdbg(`жест: dy=${dy} цель=${label(cur.target)} touch-action=${ta} скроллер=${label(cur.sc)} сдвиг=${cur.sc ? Math.round(cur.sc.scrollTop - cur.top0) : 'нет скроллера'} pointercancel=${cur.canceled} touchmove-отменён=${cur.prevented}`)
    }, 300)
  }, { capture: true, passive: true })
}
