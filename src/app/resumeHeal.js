import { useEffect } from 'react'
import { closeHudPopup } from './hudPopupState.js'
import { fdbg } from '../shared/lib/feedDebug.js'

// «Самолечение» при возврате в приложение (iPhone: свернул → развернул — и вкладки нижней панели не реагируют на тап).
// Корень на настоящем телефоне не пойман (в headless-Chromium слоя поверх панели нет), поэтому три страховки:
//  1) сброс блокировок, которые могли остаться от прерванного жеста (pointer-events/user-select на html/body, класс
//     перетаскивания канваса, открытое окошко худа, глотающее первый тап);
//  2) проба: что реально лежит над кнопками панели. Невидимый слой (opacity 0 у него или у предка) снимаем с
//     попадания (pointer-events: none); видимый — только пишем в DBG-лог (может быть законным окном);
//  3) запасной тап: пока идёт «окно возврата» (RESUME_WINDOW_MS), тап по кнопке панели, за которым не пришёл click
//     (iOS иногда его не синтезирует), добивается click() самим кодом.
const RESUME_WINDOW_MS = 120_000
const CLICK_WAIT_MS = 450
const MIN_GAP_MS = 800
const TAP_SLOP_PX = 12

const label = el => `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/)[0]}` : ''}`

// Предок (или сам элемент) с нулевой прозрачностью — невидимый слой, который не должен ловить касания
export function invisibleAncestor(el, getStyle) {
  for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
    if (parseFloat(getStyle(e).opacity) === 0) return e
  }
  return null
}

// Первый элемент, лежащий поверх кнопки нижней панели (не она сама и не её потомок), или null
export function findNavCover(doc) {
  const nav = doc.querySelector('.shellV2Nav')
  if (!nav) return null
  for (const btn of nav.querySelectorAll('.shellV2NavBtn')) {
    const r = btn.getBoundingClientRect()
    if (!r.width || !r.height) continue
    const hit = doc.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    if (hit && !nav.contains(hit)) return hit
  }
  return null
}

function resetLocks(doc) {
  for (const el of [doc.documentElement, doc.body]) {
    if (!el) continue
    el.style.pointerEvents = ''
    el.style.userSelect = ''
  }
  doc.body?.classList.remove('canvasDragging')
  closeHudPopup()
}

// Возвращает описание снятого слоя (для лога) или null
export function probeNav(doc, getStyle) {
  const cover = findNavCover(doc)
  if (!cover) return null
  const ghost = invisibleAncestor(cover, getStyle)
  if (ghost) {
    ghost.style.pointerEvents = 'none'
    return `снят невидимый слой ${label(ghost)}`
  }
  return `панель закрыта видимым ${label(cover)} (оставлено как есть)`
}

let resumedAt = 0

export function healAfterResume(doc = document, getStyle = el => getComputedStyle(el)) {
  const now = Date.now()
  if (now - resumedAt < MIN_GAP_MS) return
  resumedAt = now
  resetLocks(doc)
  const nav = doc.querySelector('.shellV2Nav')
  // Свежий слой панели: iOS после возврата иногда держит старую область попадания у fixed-слоя
  if (nav) {
    nav.style.willChange = 'auto'
    void nav.offsetHeight
    requestAnimationFrame(() => { nav.style.willChange = '' })
  }
  // Пробуем дважды: сразу после возврата слой мог быть законным «уходящим» окошком
  for (const ms of [300, 1500]) {
    setTimeout(() => {
      const res = probeNav(doc, getStyle)
      if (res) fdbg(`возврат из фона: ${res}`)
    }, ms)
  }
}

// Запасной тап по кнопкам нижней панели (см. п. 3 выше)
function armTapFallback(doc) {
  let start = null
  let timer = null
  const onStart = e => {
    const btn = e.target.closest?.('.shellV2NavBtn')
    const p = e.touches?.[0]
    start = btn && p ? { btn, x: p.clientX, y: p.clientY } : null
  }
  const onEnd = e => {
    const s = start
    start = null
    const p = e.changedTouches?.[0]
    if (!s || !p || Date.now() - resumedAt > RESUME_WINDOW_MS) return
    if (Math.hypot(p.clientX - s.x, p.clientY - s.y) > TAP_SLOP_PX) return
    clearTimeout(timer)
    timer = setTimeout(() => { fdbg(`возврат из фона: click не пришёл, жму ${label(s.btn)} сам`); s.btn.click() }, CLICK_WAIT_MS)
  }
  const onClick = () => clearTimeout(timer)
  doc.addEventListener('touchstart', onStart, { capture: true, passive: true })
  doc.addEventListener('touchend', onEnd, { capture: true, passive: true })
  doc.addEventListener('click', onClick, true)
  return () => {
    clearTimeout(timer)
    doc.removeEventListener('touchstart', onStart, true)
    doc.removeEventListener('touchend', onEnd, true)
    doc.removeEventListener('click', onClick, true)
  }
}
export function useResumeHeal() {
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') healAfterResume() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onVisible)
    window.addEventListener('focus', onVisible)
    const offTap = armTapFallback(document)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onVisible)
      window.removeEventListener('focus', onVisible)
      offTap()
    }
  }, [])
}
