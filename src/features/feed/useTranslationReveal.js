import { useCallback, useEffect, useRef, useState } from 'react'
import { createRubDetector } from './rubDetector.js'

// Перевод фразы в ленте (2026-10-03): подписи «перевести» больше нет — перевод появляется под фразой, когда её
// потёрли пальцем туда-сюда (rubDetector.js: уверенные штрихи, без ложных срабатываний от тапов и свайпов).
// Пока трёшь, перевод проступает под фразой вслед за пальцем (CSS-переменная --rub у строки перевода — без
// перерисовок React на каждое движение); отпустил раньше времени — он прячется обратно.
// Фазы:
//   off    — перевод спрятан, подписи нет; открывается только трением;
//   open   — перевод показан; стрелка (toggle) прячет его;
//   closed — спрятали стрелкой: остаётся подпись «перевести» со стрелкой, тап открывает снова —
//            пока человек на этом слайде. Ушёл со слайда (или лента подменила фразу) — снова off: тереть заново.
// enabled — фраза открыта (шарики разлетелись) и перевод у неё есть; onRubbed — перевод открыли трением
// (подсказка «потри» после этого гаснет насовсем).
// → { phase, setSub, rubProps, toggle } — setSub — ref строки перевода, rubProps вешаются на блок фразы
const CLICK_GUARD_MS = 450 // после трения тап по слову под пальцем не должен открыть его перевод
const DRAG_PX = 10         // сдвиг, после которого отпускание — не тап

export function useTranslationReveal({ active, modId, enabled, onRubbed }) {
  const [st, setSt] = useState({ modId, phase: 'off' })
  // Ушли со слайда или лента подменила фразу — перевод снова спрятан (сброс при рендере, не в эффекте)
  if (st.modId !== modId || (!active && st.phase !== 'off')) setSt({ modId, phase: 'off' })
  const phase = st.modId === modId ? st.phase : 'off'

  const subEl = useRef(null)
  const setSub = useCallback(el => { subEl.current = el }, [])
  const [det] = useState(() => createRubDetector())
  const live = useRef({})
  useEffect(() => { live.current = { enabled: enabled && active, phase, modId, onRubbed } })
  const gesture = useRef(null)    // { x0, rect, dragged, stop }
  const guardUntil = useRef(0)

  const showProgress = p => { subEl.current?.style.setProperty('--rub', p ? p.toFixed(3) : '0') }
  const stopGesture = () => { gesture.current?.stop(); gesture.current = null }
  useEffect(() => () => gesture.current?.stop(), [])

  function onPointerDown(e) {
    const L = live.current
    if (!L.enabled || L.phase === 'open' || (e.pointerType === 'mouse' && e.button !== 0)) return
    stopGesture()
    const rect = e.currentTarget.getBoundingClientRect()
    const g = { x0: e.clientX, rect, dragged: false, stop: null }
    det.start(e.clientX, e.clientY, e.timeStamp)
    const inside = ev => ev.clientX > rect.left - 40 && ev.clientX < rect.right + 40
      && ev.clientY > rect.top - 36 && ev.clientY < rect.bottom + 36
    const finish = () => {
      stopGesture()
      showProgress(0)
      guardUntil.current = Date.now() + CLICK_GUARD_MS
      try { navigator.vibrate?.(12) } catch { /* нет вибрации — переживём */ }
      setSt({ modId: live.current.modId, phase: 'open' })
      live.current.onRubbed?.()
    }
    const onMove = ev => {
      if (!inside(ev)) { showProgress(0); stopGesture(); return }
      if (Math.abs(ev.clientX - g.x0) > DRAG_PX) g.dragged = true
      const r = det.move(ev.clientX, ev.clientY, ev.timeStamp)
      if (r.done) { finish(); return }
      showProgress(r.progress)
    }
    const onEnd = () => {
      if (g.dragged) guardUntil.current = Date.now() + CLICK_GUARD_MS // отпускание после сдвига — не тап по слову
      showProgress(0)
      stopGesture()
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onEnd)
    document.addEventListener('pointercancel', onEnd)
    g.stop = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onEnd)
      document.removeEventListener('pointercancel', onEnd)
      det.reset()
    }
    gesture.current = g
  }

  // Клик, который «дотащился» до слова после трения, глушим — иначе открылся бы перевод слова
  function onClickCapture(e) {
    if (Date.now() > guardUntil.current) return
    e.stopPropagation()
    e.preventDefault()
  }

  function toggle() {
    setSt(s => ({ modId, phase: s.phase === 'open' ? 'closed' : 'open' }))
  }

  return { phase, setSub, rubProps: { onPointerDown, onClickCapture }, toggle }
}
