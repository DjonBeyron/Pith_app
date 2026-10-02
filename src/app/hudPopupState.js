import { useEffect, useState } from 'react'

// Общее состояние «какое окошко hudBar открыто» (уровень/билеты/энергия) —
// чтобы клик по одному бейджу закрывал попап другого, а не открывал оба сразу.
let openId = null
const subs = new Set()

export function isHudPopupOpen(id) {
  return openId === id
}

export function toggleHudPopup(id) {
  openId = openId === id ? null : id
  subs.forEach(fn => fn(openId))
}

export function closeHudPopup() {
  openId = null
  subs.forEach(fn => fn(openId))
}

export function subscribeHudPopup(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}

// Закрытие окошка тапом ВНЕ его: перехват pointerdown на фазе захвата у
// document — закрываем окно и «съедаем» и сам тап, и следующий за ним click,
// чтобы они не долетели до контента под окном (видео ленты ставилось на
// паузу). Полноэкранная подложка-ловушка тут не работает: попап заперт в
// stacking-контексте худ-бара (transform + z-index), слой в body оказывается
// либо ниже всего приложения (.shellV2 z-50), либо накрыл бы само окно.
export function useHudOutsideDismiss(wrapRef, open) {
  useEffect(() => {
    if (!open) return
    const swallowClick = e => { e.stopPropagation(); e.preventDefault() }
    const onDown = e => {
      if (wrapRef.current && wrapRef.current.contains(e.target)) return
      e.stopPropagation()
      e.preventDefault()
      // click прилетит следом за pointerdown — глушим ровно один
      document.addEventListener('click', swallowClick, { capture: true, once: true })
      closeHudPopup()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('click', swallowClick, true)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps -- wrapRef стабилен
}

// Окошко худа не пропадает мгновенно: после закрытия оно ещё EXIT_MS остаётся в разметке с классом --out и схлопывается в
// свой угол (hud-pop-out.css) — обратная анимация к появлению, как у окошка счётчика памяти (MemoryCount.jsx).
// → { shown: рисовать окошко, closing: оно сейчас схлопывается }
const EXIT_MS = 340 // = длительность hudPopOut в hud-pop-out.css

export function useHudPopupExit(open) {
  const [prevOpen, setPrevOpen] = useState(open)
  const [closing, setClosing] = useState(false)
  // Подстройка состояния при смене пропа прямо в рендере (паттерн из доков React): закрыли → пошло схлопывание
  if (open !== prevOpen) {
    setPrevOpen(open)
    setClosing(!open && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  }
  useEffect(() => {
    if (!closing) return undefined
    const t = setTimeout(() => setClosing(false), EXIT_MS)
    return () => clearTimeout(t)
  }, [closing])
  return { shown: open || closing, closing: closing && !open }
}
