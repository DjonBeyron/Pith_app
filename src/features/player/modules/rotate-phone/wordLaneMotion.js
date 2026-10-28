// Движение пилюль — на композиторе (Web Animations API), а не по кадрам из JS. Скорость конвейера постоянна, поэтому путь пилюли — одна линейная анимация «из-за верхнего края до
// нижнего» длиной FLIGHT_MS: её ведёт композитор (GPU-поток), и лаги основного потока (Vosk, React, Яндекс-браузер, щелчок с искрами) на плавность хода не влияют — раньше JS писал положение
// каждый кадр, и на смартфонах любая задержка основного потока была видна как подлагивание. JS остаётся только считать логику (заливка, щелчки, «не успел») и подправлять скорость анимации.
import { ENTER_Y, EXIT_Y, SPEED } from './wordLaneTimeline.js'

/** Сколько миллисекунд пилюля летит от ENTER_Y до EXIT_Y */
export const FLIGHT_MS = ((EXIT_Y - ENTER_Y) / SPEED) * 1000
export const ANIM_MS = FLIGHT_MS + 120000

// Положение пилюли — ОТДЕЛЬНОЕ свойство translate (то же, что у пилюли в CSS: -50% по x, центр в y % высоты экрана). Не transform: щелчок (wordLaneSnap) хлопает пилюлю свойством scale, а оно
// в цепочке «translate → rotate → scale → transform» стоит ПОСЛЕ translate — масштаб растягивает только саму пилюлю вокруг её центра. Если положение лежало бы в transform, хлопок умножал
// бы и сдвиг (пилюля на 50 % высоты подпрыгивала на 6 % экрана при каждом щелчке — это и было заметным «втыканием»). Дрожь промаха — transform (translateX), она тоже не мешает.
export const flightPosition = y => `-50% calc(${y.toFixed(3)}dvh - 50%)`

/**
 * Запустить полёт пилюли el. atMs — сколько мс полёта уже прошло (отрицательное — ещё не выкатилась: пилюля ждёт за верхним краем). Возвращает Animation; fill 'both' держит пилюлю
 * за краем до выката и после ухода.
 */
export function startFlight(el, atMs = 0) {
  // Анимация длится дольше самого полёта (после EXIT_Y пилюля стоит за краем): она не «finished» посреди игры, и её currentTime — надёжные часы фазы (их читает движок)
  const a = el.animate([{ translate: flightPosition(ENTER_Y) }, { translate: flightPosition(EXIT_Y), offset: FLIGHT_MS / ANIM_MS }, { translate: flightPosition(EXIT_Y) }], { duration: ANIM_MS, easing: 'linear', fill: 'both' })
  a.currentTime = atMs
  return a
}

/** Остановить полёты и вернуть пилюли на старт (CSS: --y = ENTER_Y) */
export function cancelFlights(anims) {
  for (let i = 0; i < anims.length; i++) { try { anims[i]?.cancel() } catch { /* уже снята */ } anims[i] = null }
}

/** Изменить скорость полёта (поправка под звук), не трогая текущее положение; пустяковые изменения не пересылаем композитору */
export function setFlightRate(anims, rate, last) {
  if (Math.abs(rate - last) < 0.003) return last
  for (const a of anims) { try { a?.updatePlaybackRate(rate) } catch { /* без поддержки — едет с обычной скоростью */ } }
  return rate
}
