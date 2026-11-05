// Колесо ленты разбора крутит scrollTop руками (PlayerLikeFeed). scrollTop целочисленный: дробная дельта (точные мыши, тачпады, дробный
// масштаб экрана) терялась — 0,4 px давали 0, 1,2 px давали 1, и лента «залипала» или шла рывками, пока не подвинешь мышь. Остаток копим.
const LINE_PX = 40

/** Один шаг колеса: delta события (px / строки / страницы) + накопленный остаток → { px (целых пикселей прокрутки сейчас), carry (остаток на потом) } */
export function wheelStep(carry, deltaY, deltaMode, pageH = 0) {
  const raw = (deltaMode === 1 ? deltaY * LINE_PX : deltaMode === 2 ? deltaY * pageH : deltaY) + carry
  const px = Math.trunc(raw)
  return { px, carry: raw - px }
}
