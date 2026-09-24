// Повторное нажатие на уже активную вкладку «Уроки» в нижней панели
// (ShellV2) = «назад» из схемы модуля, открытой из «Рекомендаций» или
// «Моих уроков» (FeedTab слушает, пока схема открыта). Во время самого урока
// плеер закрывает нижнюю панель, так что урок этим не прервать.
const EVENT = 'pithy:lessons-home'

export function requestLessonsHome() {
  window.dispatchEvent(new Event(EVENT))
}

export function onLessonsHome(fn) {
  window.addEventListener(EVENT, fn)
  return () => window.removeEventListener(EVENT, fn)
}
