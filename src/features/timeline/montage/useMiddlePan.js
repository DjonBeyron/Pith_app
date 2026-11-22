import { useEffect, useRef } from 'react'

// Панорама таймлайна ЗАЖАТОЙ СРЕДНЕЙ КНОПКОЙ мыши (колесо нажато) — в любом месте стола: над клипами, зазорами, линейкой, подписями дорожек, мини-картой; работает и в режиме «Правка»
// (средняя кнопка никогда не двигает клип). По горизонтали едет время, по вертикали — то, что прокручивается по высоте (если дорожки не помещаются). Курсор — «рука» (data-pan="mid" на зоне).
// Системная автопрокрутка средней кнопки и «вставка / открыть в новой вкладке» отключены (preventDefault на mousedown и auxclick). Остальные способы (колесо, Ctrl + колесо, перетаскивание пустого
// места левой кнопкой, мини-карта) не меняются.
// createMiddlePan — чистая логика без React и DOM-слушателей (тесты): scrollers() → { x, y } — элементы, у которых двигаются scrollLeft и scrollTop (любой может быть null).
export const MIDDLE = 1

export function createMiddlePan({ scrollers, onState = () => {} }) {
  let pan = null // { x0, y0, left, top, x, y }
  return {
    /** Нажатие: средняя кнопка начинает панораму (true); любая другая — нет (false) */
    down(e) {
      if (e.button !== MIDDLE) return false
      const { x = null, y = null } = scrollers() ?? {}
      if (!x && !y) return false
      e.preventDefault?.() // иначе браузер включает свою автопрокрутку
      pan = { x0: e.clientX, y0: e.clientY, x, y, left: x?.scrollLeft ?? 0, top: y?.scrollTop ?? 0 }
      onState(true)
      return true
    },
    /** Движение мыши: стол едет за рукой */
    move(e) {
      if (!pan) return false
      if (pan.x) pan.x.scrollLeft = Math.max(0, pan.left - (e.clientX - pan.x0))
      if (pan.y) pan.y.scrollTop = Math.max(0, pan.top - (e.clientY - pan.y0))
      e.preventDefault?.()
      return true
    },
    /** Кнопку отпустили (или указатель потерян) — панорама кончилась */
    up() { if (!pan) return false; pan = null; onState(false); return true },
    active: () => !!pan,
  }
}

/** Ближайший предок (или сам элемент), который прокручивается по вертикали */
function scrollY(el) {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.scrollHeight > n.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(n).overflowY)) return n
  }
  return null
}

/** areaRef — зона, где работает средняя кнопка (стол вместе с мини-картой); getScroller() — элемент с горизонтальной прокруткой по времени */
export function useMiddlePan(areaRef, getScroller) {
  const get = useRef(getScroller)
  useEffect(() => { get.current = getScroller })
  useEffect(() => {
    const area = areaRef.current
    if (!area) return undefined
    const core = createMiddlePan({
      scrollers: () => { const x = get.current?.() ?? null; return { x, y: scrollY(x ?? area) } },
      onState: on => { if (on) area.dataset.pan = 'mid'; else delete area.dataset.pan },
    })
    const down = e => core.down(e)
    const move = e => core.move(e)
    const up = () => core.up()
    const aux = e => { if (e.button === MIDDLE) e.preventDefault() } // средний щелчок ничего не открывает и не вставляет
    area.addEventListener('mousedown', down); area.addEventListener('auxclick', aux)
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); window.addEventListener('blur', up)
    return () => {
      core.up()
      area.removeEventListener('mousedown', down); area.removeEventListener('auxclick', aux)
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); window.removeEventListener('blur', up)
    }
  }, [areaRef])
}
