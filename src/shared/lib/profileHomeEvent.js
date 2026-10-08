// Повторное нажатие на уже активную вкладку «Профиль» в нижней панели
// (ShellV2) = «назад» на главный экран профиля из подэкрана: «Кастомизация
// профиля» (там же достижения), «Настройки», схема сохранённого модуля
// (ProfileV2 слушает; ShellV2 — для настроек гостя). Так же устроены
// learnHomeEvent.js («Память») и lessonsHomeEvent.js («Уроки»).
const EVENT = 'pithy:profile-home'

export function requestProfileHome() {
  window.dispatchEvent(new Event(EVENT))
}

export function onProfileHome(fn) {
  window.addEventListener(EVENT, fn)
  return () => window.removeEventListener(EVENT, fn)
}
