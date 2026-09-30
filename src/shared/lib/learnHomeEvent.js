// Повторное нажатие на уже активную вкладку «Память» в нижней панели
// (ShellV2) = «назад» на главный экран памяти из списка слов ступени или
// страницы уровней (LearnTab слушает). Так же устроено у «Уроков» —
// lessonsHomeEvent.js. Во время повторения экран закрывает нижнюю панель,
// так что сессию этим не прервать.
const EVENT = 'pithy:learn-home'

export function requestLearnHome() {
  window.dispatchEvent(new Event(EVENT))
}

export function onLearnHome(fn) {
  window.addEventListener(EVENT, fn)
  return () => window.removeEventListener(EVENT, fn)
}
