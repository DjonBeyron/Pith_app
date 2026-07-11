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
