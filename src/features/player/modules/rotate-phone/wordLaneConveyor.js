// Модель конвейера дорожки (v3.3.85): скорость пунктира на дорожке с разгоном и торможением. Чистый модуль — без React, DOM и часов: время приходит шагом dt, проверяется тестами (wordLaneConveyorModel.test.js).
// Одна дорожка — одно состояние (независимо от соседних): idle → ignite → accel → run → decel → idle.
//  idle    — стоит, пунктир еле виден (REST_A);
//  ignite  — «зажигание», IGNITE_MS: яркость волной бежит по пунктиру сверху вниз (wave 0 → 1), штрихи стоят;
//  accel   — ACCEL_MS: скорость и яркость плавно (smoothstep) растут до рабочих; рабочая скорость = скорость пилюль (SPEED, wordLaneTimeline.js);
//  run     — едет с рабочей скоростью;
//  decel   — DECEL_MS: плавное замедление до нуля и спад яркости.
// Когда дорожке ехать (want): на ней есть пилюли, либо дорожка «взведена» (armed — игра дала команду, wordLaneConveyorArm.js) и пилюль ещё не было, либо они пропали не больше HOLD_MS назад
// (пауза между повторами ученика не должна останавливать конвейер). Остановка начинается, когда пилюль на дорожке не осталось (улетели вверх, ушли вниз, сцена кончилась), а не по смене стадии.
// Старт идёт за CONVEYOR_LEAD_MS до того, как выедет пилюля, — к ней дорожка уже на рабочей скорости (момент старта — wordLaneConveyorStart.js).
import { SPEED } from './wordLaneTimeline.js'

export const IGNITE_MS = 240   // волна яркости по пунктиру (200–300 мс)
export const ACCEL_MS = 420    // разгон до рабочей скорости
export const DECEL_MS = 700    // торможение
export const HOLD_MS = 400     // пилюль нет столько мс — дорожка начинает тормозить
export const CONVEYOR_LEAD_MS = IGNITE_MS + ACCEL_MS // зажигание + разгон = 660 мс ≈ 40 кадров: за столько до выезда пилюли дорожку включают
export const RUN_SPEED = SPEED // dvh в секунду (высота экрана — 100 dvh, SPEED — % высоты в секунду)
export const PERIOD = 11       // период пунктира, dvh
export const REST_A = 0.14     // прозрачность пунктира в покое («еле-еле»)
export const RUN_A = 0.52      // и на рабочей скорости
export const LIT = 0.55        // доля яркости, которую волна оставляет за собой (дальше её доводит разгон)
export const WAVE_PAD = 12     // волна стартует выше экрана и уходит ниже на столько dvh

export const ease = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))

export const createLane = () => ({ phase: 'idle', t: 0, s: 0, g: 0, s0: 0, g0: 0, y: 0, seen: false, gone: 0 })

/** Дорожке сейчас ехать? Обновляет «видела пилюли» (seen) и «сколько мс их нет» (gone) */
function wantRun(L, dt, armed, pills) {
  if (pills > 0) { L.seen = true; L.gone = 0 } else if (L.seen) L.gone += dt
  if (!armed && pills === 0) { L.seen = false; L.gone = 0 } // команду сняли и пилюль нет — следующий запуск начнётся с нуля
  return pills > 0 || (armed && (!L.seen || L.gone < HOLD_MS))
}

function go(L, phase, t = 0) { L.phase = phase; L.t = t; L.s0 = L.s; L.g0 = L.g }

/**
 * Шаг дорожки на dt мс. armed — дорожке дана команда ехать, pills — сколько пилюль сейчас на ней, still — без движения (слабое устройство, reduced-motion: только яркость, y не меняется).
 * Меняет L и возвращает его: s (скорость, dvh/с), g (яркость 0…1), y (сдвиг пунктира 0…PERIOD).
 */
export function stepLane(L, dt, { armed = false, pills = 0, still = false } = {}) {
  const want = wantRun(L, dt, armed, pills)
  if (L.phase === 'idle') { if (want) go(L, 'ignite', dt) }
  else {
    L.t += dt
    if (!want && L.phase !== 'decel') go(L, 'decel')
    else if (want && L.phase === 'decel') go(L, 'accel')
  }
  if (L.phase === 'ignite') {
    L.s = 0; L.g = LIT
    if (L.t >= IGNITE_MS) go(L, 'accel', L.t - IGNITE_MS)
  }
  if (L.phase === 'accel') {
    const e = ease(L.t / ACCEL_MS)
    L.s = L.s0 + (RUN_SPEED - L.s0) * e; L.g = L.g0 + (1 - L.g0) * e
    if (L.t >= ACCEL_MS) { L.s = RUN_SPEED; L.g = 1; L.phase = 'run' }
  } else if (L.phase === 'decel') {
    const e = ease(L.t / DECEL_MS)
    L.s = L.s0 * (1 - e); L.g = L.g0 * (1 - e)
    if (L.t >= DECEL_MS) { L.s = 0; L.g = 0; L.phase = 'idle'; L.t = 0 }
  }
  if (!still && L.s > 0) L.y = (L.y + (L.s * dt) / 1000) % PERIOD
  return L
}

/** Что рисовать: y — сдвиг пунктира (dvh), a — прозрачность штрихов, wave — позиция волны «зажигания» (0…1 сверху вниз) или null */
export function laneLook(L) {
  return { y: L.y, a: REST_A + (RUN_A - REST_A) * L.g, wave: L.phase === 'ignite' ? Math.min(1, L.t / IGNITE_MS) : null, phase: L.phase }
}

/** Все дорожки стоят — привод можно усыпить */
export const settled = lanes => lanes.every(L => L.phase === 'idle')
