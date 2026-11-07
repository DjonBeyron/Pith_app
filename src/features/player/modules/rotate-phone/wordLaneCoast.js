// Доезд пилюль кончившейся ступени (замечание владельца 2026-11-07: «когда предпоследний этап закончен, его пилюля должна просто уехать, а не исчезнуть, и это не должно блокировать Пита»).
// Раньше уборка сцены (useWordLanePills) отдавала в пул ВСЕ пилюли (pool.giveAll): отыгранные пилюли круга «Фраз» или чужие пилюли последнего слова «Пинг-понга», ещё едущие вниз, пропадали посреди экрана,
// как только директор переходил к плашке следующей ступени. Теперь кончившаяся ступень (сцена «Фраз» — после fx.finished, ученик гонки — после done) отдаёт едущие пилюли «на доезд» (pool.coast):
// у пилюли остаются её полёт (та же WAAPI-анимация — скорость не меняется) и признак data-coast, через msToExit мс (пересекла EXIT_Y) она возвращается в пул. Взлетающие и «всплывшие» (linger) уходят сами.
// Ничего не ждёт доезда: директор и Пит идут дальше по прежнему таймингу. Следующая сцена строит свой пул из тех же элементов — take пропускает data-coast; первая пилюля новой сцены
// выезжает не ближе cfg.gap за последней доезжающей (coastTail — где она сейчас): лента одна, порядок сохраняется, не наезжают.
import { FLIGHT_MS } from './wordLaneMotion.js'
import { flightY } from './wordLaneRise.js'

const riders = new WeakMap() // корень поля → Set доезжающих { anim }

/** Сколько мс летящей пилюле до нижнего края (EXIT_Y) по часам её полёта; null — ещё не выехала из-за верхнего края, уже ушла или не летит */
export function msToExit(anim) {
  const t = Number(anim?.currentTime)
  if (!anim || !(t > 0) || t >= FLIGHT_MS) return null
  return (FLIGHT_MS - t) / (Math.abs(Number(anim.playbackRate)) || 1)
}

/** Запомнить доезжающую пилюлю поля root (для coastTail); возвращает «снять» — когда пилюля ушла в пул */
export function addRider(root, anim) {
  if (!root) return () => {}
  let set = riders.get(root)
  if (!set) { set = new Set(); riders.set(root, set) }
  const r = { anim }
  set.add(r)
  return () => set.delete(r)
}

/** Где сейчас самая верхняя доезжающая пилюля поля (центр, % высоты экрана); нет доезжающих — null */
export function coastTail(root) {
  const set = root ? riders.get(root) : null
  if (!set?.size) return null
  let top = Infinity
  for (const r of set) top = Math.min(top, flightY(r.anim))
  return top
}
