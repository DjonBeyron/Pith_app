// Движение пилюль — на композиторе (Web Animations API), а не по кадрам из JS. Скорость конвейера постоянна, поэтому путь пилюли — одна линейная анимация «из-за верхнего края до нижнего» длиной FLIGHT_MS:
// её ведёт композитор (GPU-поток), и лаги основного потока (Vosk, React, Яндекс-браузер, щелчок с искрами) на плавность хода не влияют — раньше JS писал положение каждый кадр, и на смартфонах любая задержка
// основного потока была видна как подлагивание. JS остаётся только считать логику (заливка, щелчки, «не успел») и подправлять скорость анимации. Спуск — ПРЯМАЯ: без волны и наклона; по синусоиде идёт только
// взлёт принятой пилюли (wordLaneRise.js, wordLaneWave.js).
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
export const EDGE_SCALE = 0.85     // «Гонка с Питом» (edge): у краёв экрана пилюля чуть меньше…
export const EDGE_MID_Y = 50       // …к 50 % высоты — обычного размера
const EDGE_STEPS = 16

/** Масштаб пилюли на высоте y (% экрана): 1 на середине, EDGE_SCALE у входа и у ухода, плавно (smoothstep) */
export function edgeScale(y) {
  const d = Math.min(1, Math.max(0, y < EDGE_MID_Y ? (EDGE_MID_Y - y) / (EDGE_MID_Y - ENTER_Y) : (y - EDGE_MID_Y) / (EXIT_Y - EDGE_MID_Y)))
  return +(1 - (1 - EDGE_SCALE) * d * d * (3 - 2 * d)).toFixed(4)
}

/** Кадры полёта с масштабом: положение — как у прямого полёта, scale — по edgeScale от высоты (одна анимация на композиторе: translate + scale) */
export function edgeFrames() {
  const marks = [...new Set([...Array.from({ length: EDGE_STEPS + 1 }, (_, i) => i / EDGE_STEPS), (EDGE_MID_Y - ENTER_Y) / (EXIT_Y - ENTER_Y)])].sort((a, b) => a - b) // и точная середина (50 %): там ровно обычный размер
  const frames = marks.map(u => { const y = ENTER_Y + (EXIT_Y - ENTER_Y) * u; return { translate: flightPosition(y), scale: edgeScale(y), offset: u * (FLIGHT_MS / ANIM_MS) } })
  return [...frames, { translate: flightPosition(EXIT_Y), scale: edgeScale(EXIT_Y) }]
}

export function startFlight(el, atMs = 0, speed = 1, edge = false) { // edge — «Гонка с Питом»: пилюля у краёв меньше (edgeFrames); по умолчанию выключено // speed — «Гонка с Питом»: пилюля едет быстрее конвейера (playbackRate); положение — по-прежнему функция currentTime
  // Анимация длится дольше самого полёта (после EXIT_Y пилюля стоит за краем): она не «finished» посреди игры, и её currentTime — надёжные часы фазы (их читает движок)
  const a = el.animate(edge ? edgeFrames() : [{ translate: flightPosition(ENTER_Y) }, { translate: flightPosition(EXIT_Y), offset: FLIGHT_MS / ANIM_MS }, { translate: flightPosition(EXIT_Y) }], { duration: ANIM_MS, easing: 'linear', fill: 'both' })
  if (speed !== 1) a.playbackRate = speed
  a.currentTime = atMs * speed
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
