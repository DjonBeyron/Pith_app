import { SPEED } from '../../player/modules/rotate-phone/wordLaneTimeline.js'

// Шкала финала «Шкала памяти» (чистые функции без DOM): время реакции — сколько секунд пилюля ехала от своего появления на экране (нижний край у верхнего края поля) до ответа. Чем ниже уехала
// пилюля (и линия, которую она толкает), тем дольше вспоминалось слово и тем слабее оно держится. Скорость пилюли — SPEED · speed (% высоты поля в секунду).
export const ZONES = [{ id: 'fast', to: 2 }, { id: 'mid', to: 4 }, { id: 'slow', to: Infinity }] // до 2 с — слово держится крепко, до 4 с — средне, дольше — слабо

/** Секунды по положению нижнего края пилюли (% высоты поля) */
export const timeAt = (bottomPct, speed) => Math.max(0, bottomPct) / (SPEED * (speed > 0 ? speed : 1))
/** Положение (% высоты поля) по секундам */
export const yAt = (t, speed) => t * SPEED * (speed > 0 ? speed : 1)
/** Зона по времени */
export const zoneOf = t => ZONES.find(z => t < z.to).id
/** Подпись счётчика: «2,4 с» */
export const fmt = t => `${(Math.round(t * 10) / 10).toFixed(1).replace('.', ',')} с`
/** Деления шкалы: целые секунды от 1 до тех, что умещаются в maxPct % высоты → [{ t, y }] */
export function ticks(speed, maxPct = 100) {
  const out = []
  for (let t = 1; yAt(t, speed) <= maxPct; t++) out.push({ t, y: yAt(t, speed) })
  return out
}
