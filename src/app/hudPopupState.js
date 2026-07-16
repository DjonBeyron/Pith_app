import { useEffect } from 'react'

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
