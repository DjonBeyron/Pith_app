import { useEffect } from 'react'

// Флаг «игра открыта»: пока смонтирован оверлей игры (.wl закрывает весь экран), на <html> стоит класс gameOpen — по нему всё под игрой замирает (styles/lesson-open.css: бесконечные анимации
// нижней панели и активной вкладки ставятся на паузу и после игры идут с того же места). Отдельно от флага «урок открыт» (shared/lib/lessonOpen.js): тот ещё и закрывает микрофон при снятии —
// систему звука и микрофона этот флаг не трогает, он только про то, что рисуется под игрой. Счётчик, а не булево: «Игра заново» монтирует новую игру раньше, чем снимет прежнюю.
let count = 0

/** Поднять (on) или снять флаг; doc подставляется в тестах. → сколько игр открыто */
export function setGameOpen(on, doc = globalThis.document) {
  count = Math.max(0, count + (on ? 1 : -1))
  doc?.documentElement?.classList.toggle('gameOpen', count > 0)
  return count
}

/** Для WordLaneGame: флаг стоит, пока игра смонтирована */
export function useGameOpenFlag() {
  useEffect(() => { setGameOpen(true); return () => { setGameOpen(false) } }, [])
}
