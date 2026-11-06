// Модель конвейера дорожки (v3.3.85, плавнее с v3.3.87): скорость пунктира на дорожке с разгоном и торможением. Чистый модуль — без React, DOM и часов: время приходит шагом dt, проверяется тестами (wordLaneConveyorModel.test.js).
// Одна дорожка — одно состояние (независимо от соседних): idle → ignite → accel → run → decel → idle.
//  idle    — стоит, пунктир еле виден (REST_A);
//  ignite  — «зажигание» (v3.3.101), IGNITE_MS = BLINKS миганий по BLINK_MS: пунктир на месте плавно мигает — яркость покой → ярко → покой синусоидой (никаких рывков и волн), потом разгон. Слабое устройство / reduced-motion (still):
//            без мигания, яркость просто плавно доходит до LIT;
//  accel   — ACCEL_MS: скорость растёт по мягкой кривой «медленный старт» (easeInSoft: smootherstep — ускорение тоже начинается с нуля), яркость доходит до полной; рабочая скорость = скорость пилюль (SPEED, wordLaneTimeline.js);
//  run     — едет с рабочей скоростью; в «Гонке с Питом» пилюли разгона быстрее конвейера в speed раз — множитель speed плавно (SPEED_RAMP_MS) меняет рабочую скорость, пунктир едет быстрее пропорционально;
//  decel   — DECEL_MS: плавное замедление до нуля, яркость спадает вместе со скоростью (пропорционально), а не после остановки;
//  shift / slow — «медленный ход» гонки (v3.3.129): между этапами игра идёт, и дорожка не встаёт, а за SHIFT_MS плавно сбрасывает скорость до SLOW_RATIO рабочей (яркость пропорционально) и держит её (slow);
//            с новой командой ехать — так же плавно (shift) обратно до рабочей. Пунктир при этом не прыгает: y только интегрируется. Остановка (decel → idle) — пауза, итог, выход.
// Когда дорожке ехать (want). Два режима:
//  • по пилюлям (обычная нода, команда '1'): на ней есть пилюли, либо дорожка «взведена» (armed — игра дала команду, wordLaneConveyorStart.js) и пилюль ещё не было, либо они пропали не больше HOLD_MS назад
//    (пауза между повторами ученика не должна останавливать конвейер). Остановка начинается, когда пилюль на дорожке не осталось, а не по смене стадии;
//  • «акт идёт» (репетиция, команда '2', keep): дорожка едет непрерывно, пока идёт акт, — есть на ней пилюли или нет (Пит говорит, ученик промахнулся, стадии сменяют друг друга). Тормозит она только когда команду сняли
//    (граница акта: плашка следующего) и пилюли, которые ещё летят, ушли.
// Старт идёт за CONVEYOR_LEAD_MS до того, как выедет пилюля, — к ней дорожка уже на рабочей скорости (момент старта — wordLaneConveyorStart.js).
import { SPEED } from './wordLaneTimeline.js'

export const BLINK_MS = 250    // один цикл мигания: покой → ярко → покой
export const BLINKS = 2        // перед ходом пунктир мигает 2 раза (2–3)
export const IGNITE_MS = BLINK_MS * BLINKS // зажигание: 500 мс
export const ACCEL_MS = 800    // разгон до рабочей скорости (v3.3.87: было 420 — движение начиналось рывком)
export const DECEL_MS = 700    // торможение (не менять без mirror/MirrorCompare.jsx: автозапуск зеркала ждёт остановки дорожек на DECEL_MS)
export const HOLD_MS = 400     // пилюль нет столько мс — дорожка начинает тормозить
export const CONVEYOR_LEAD_MS = IGNITE_MS + ACCEL_MS // зажигание + разгон = 1300 мс (78 кадров): за столько до выезда первой пилюли акта дорожку включают
export const RUN_SPEED = SPEED // dvh в секунду при множителе 1 (высота экрана — 100 dvh, SPEED — % высоты в секунду)
export const SPEED_RAMP_MS = 800 // «Гонка с Питом»: множитель скорости (пилюли разгона быстрее) меняется плавно за столько мс, не рывком
export const PERIOD = 11       // период пунктира, dvh
// «Гонка с Питом» (v3.3.117): три дорожки читаются независимо. У каждой свой визуальный ход (множитель к общему ±4 %: 0,96 / 1 / 1,04), своя фаза старта пунктира (сдвиг в долях периода) и узор «нить с узелками» с периодом RACE_PERIOD
// (три коротких штриха, длинная черта, три штриха, двоеточие; CSS — word-lane-lane-run.css, маска на ::before колонки, новых узлов нет). Всё детерминированно, без случайных чисел; у обычной ноды createLane() без номера дорожки — как раньше.
export const RACE_PERIOD = 51.6  // период узора гонки, dvh (нить с узелками, v3.3.131: три узелка на период, 24 штриха нити)
export const LANE_RATES = [0.96, 1, 1.04]  // множитель визуального хода дорожек 0, 1, 2 (скорость пилюль не меняется)
export const LANE_PHASES = [0, 0.37, 0.71] // сдвиг начала пунктира, доли RACE_PERIOD
export const REST_A = 0.14     // прозрачность пунктира в покое («еле-еле»)
export const RUN_A = 0.52      // и на рабочей скорости
export const PULSE_MS = 600    // «Гонка с Питом», ТОЛЬКО переход между первым и вторым кругом этапа (ускорение на 10 %, v3.3.115): пунктир на столько мс ярче и с чуть длиннее штрихами (мягкая волна сверху вниз — CSS data-wave, привод)
export const PULSE_A = 0.7     // яркость штрихов в пике импульса (--run-a, обычно RUN_A = 0,52; было 0,9)
export const PULSE_DASH = 1.2  // длина штрихов в пике (множитель к 2,2 dvh; --run-dash; было 1,4)
export const PULSE_MIN_RATIO = 1.08 // импульс — когда множитель скорости вырос не меньше чем на 8 % разом: шаг +5 % за пилюлю блеска не даёт, старт второго круга (×1,1) — даёт
export const SLOW_RATIO = 0.3  // «медленный ход» гонки между этапами: доля рабочей скорости (и яркости) — дорожки не стоят, а едут медленно
export const SHIFT_MS = 900    // переход рабочий ход ↔ медленный (smoothstep: без рывков на обоих краях)
export const LIT = 0.55        // доля яркости, до которой доходит пунктир при «зажигании» без мигания (still)

export const ease = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))
/** Мягкий старт: smootherstep — скорость и её прирост начинаются с нуля, к концу кривая тоже ложится без излома (у smoothstep прирост в начале уже ненулевой) */
export const easeInSoft = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (x * 6 - 15) + 10))

/** Яркость мигания (0…1) через t мс зажигания: 0 → 1 → 0 за BLINK_MS, косинусом — без изломов на стыках циклов */
export const blink = t => (1 - Math.cos((2 * Math.PI * Math.min(t, IGNITE_MS)) / BLINK_MS)) / 2

export const createLane = (race = -1) => ({ k: LANE_RATES[race] ?? 1, per: LANE_RATES[race] ? RACE_PERIOD : PERIOD, phase: 'idle', t: 0, s: 0, g: 0, s0: 0, g0: 0, y: LANE_RATES[race] ? LANE_PHASES[race] * RACE_PERIOD : 0, seen: false, gone: 0, v: 1, vw: 1, v0: 1, vt: SPEED_RAMP_MS, pt: PULSE_MS, pn: 0, r: 0 }) // pt — сколько мс идёт импульс скорости (PULSE_MS — не идёт), pn — сколько импульсов было

/** Множитель рабочей скорости: v плавно (smoothstep за SPEED_RAMP_MS) идёт к wanted; новая цель в середине перехода — переход заново от текущего значения; дорожка стоит — множитель сразу новый (нечему рвать) */
function stepSpeed(L, dt, wanted) {
  if (!(wanted > 0)) return
  if (wanted !== L.vw) { if (L.phase !== 'idle' && wanted >= L.vw * PULSE_MIN_RATIO - 1e-9) { L.pt = 0; L.pn += 1 } // дорожка едет, скорость выросла — импульс (яркость и длина штрихов, laneLook)
    L.vw = wanted; L.v0 = L.v; L.vt = 0; if (L.phase === 'idle') { L.v = L.v0 = wanted; L.vt = SPEED_RAMP_MS } }
  if (L.vt < SPEED_RAMP_MS) { L.vt = Math.min(SPEED_RAMP_MS, L.vt + dt); L.v = L.v0 + (L.vw - L.v0) * ease(L.vt / SPEED_RAMP_MS) }
}

/** Дорожке сейчас ехать? (true — рабочий ход) Обновляет «видела пилюли» (seen) и «сколько мс их нет» (gone). keep — акт идёт (команда '2'): едет, пока команда стоит, пилюли не нужны */
function wantRun(L, dt, armed, pills, keep) {
  if (pills > 0) { L.seen = true; L.gone = 0 } else if (L.seen) L.gone += dt
  if (!armed && pills === 0) { L.seen = false; L.gone = 0 } // команду сняли и пилюль нет — следующий запуск начнётся с нуля
  if (armed && keep) return true
  return pills > 0 || (armed && (!L.seen || L.gone < HOLD_MS))
}

function go(L, phase, t = 0) { L.phase = phase; L.t = t; L.s0 = L.s; L.g0 = L.g }

/** Доля рабочей скорости, к которой идёт дорожка: 'run' — 1, 'slow' — SLOW_RATIO, 'stop' — 0 */
export const ratioOf = want => (want === 'run' ? 1 : want === 'slow' ? SLOW_RATIO : 0)
const held = r => (r < 1 ? 'slow' : 'run')

/**
 * Шаг дорожки на dt мс. armed — дорожке дана команда ехать, keep — и держать ход, пока идёт акт (даже без пилюль), pills — сколько пилюль сейчас на ней, still — без движения (слабое устройство, reduced-motion: только яркость, y не меняется),
 * slow — игра идёт (гонка между этапами): без команды ехать дорожка не встаёт, а едет медленным ходом (SLOW_RATIO).
 * Меняет L и возвращает его: s (скорость, dvh/с), g (яркость 0…1), y (сдвиг пунктира 0…PERIOD; у дорожек гонки — 0…RACE_PERIOD, ход ×LANE_RATES), r — доля рабочей скорости, к которой идёт дорожка. createLane(n): n = 0…2 — номер дорожки гонки, без номера — обычная дорожка.
 */
export function stepLane(L, dt, { armed = false, pills = 0, still = false, keep = false, speed = 1, slow = false } = {}) {
  const want = wantRun(L, dt, armed, pills, keep) ? 'run' : slow ? 'slow' : 'stop'
  const r = ratioOf(want)
  stepSpeed(L, dt, speed)
  if (L.phase === 'idle') { if (r > 0) { go(L, 'ignite', dt); L.r = r } }
  else {
    L.t += dt
    if (r === 0) { if (L.phase !== 'decel') go(L, 'decel') }
    else if (L.phase === 'decel') { go(L, 'accel'); L.r = r }
    else if (r !== L.r) { if (L.phase === 'ignite') L.r = r; else { go(L, L.phase === 'accel' ? 'accel' : 'shift'); L.r = r } } // новая цель посреди разгона — разгон заново от текущей скорости
  }
  const top = () => RUN_SPEED * L.v * L.r
  if (L.phase === 'ignite') {
    L.s = 0
    L.g = still ? L.g0 + (LIT - L.g0) * ease(L.t / IGNITE_MS) : blink(L.t) // мигание синусоидой; без движения — плавный подъём яркости
    if (L.t >= IGNITE_MS) go(L, 'accel', L.t - IGNITE_MS)
  }
  if (L.phase === 'accel') {
    L.s = L.s0 + (top() - L.s0) * easeInSoft(L.t / ACCEL_MS); L.g = L.g0 + (L.r - L.g0) * ease(L.t / ACCEL_MS)
    if (L.t >= ACCEL_MS) { L.s = top(); L.g = L.r; L.phase = held(L.r) }
  } else if (L.phase === 'shift') {
    const e = ease(L.t / SHIFT_MS)
    L.s = L.s0 + (top() - L.s0) * e; L.g = L.g0 + (L.r - L.g0) * e
    if (L.t >= SHIFT_MS) { L.s = top(); L.g = L.r; L.phase = held(L.r) }
  } else if (L.phase === 'run' || L.phase === 'slow') {
    L.s = top() // множитель идёт плавно (stepSpeed): скорость пунктира следует за скоростью пилюль
  } else if (L.phase === 'decel') {
    const e = ease(L.t / DECEL_MS)
    L.s = L.s0 * (1 - e); L.g = L.g0 * (1 - e)
    if (L.t >= DECEL_MS) { L.s = 0; L.g = 0; L.phase = 'idle'; L.t = 0 }
  }
  if (L.pt < PULSE_MS) L.pt = Math.min(PULSE_MS, L.pt + dt)
  if (!still && L.s > 0) L.y = (L.y + (L.s * L.k * dt) / 1000) % L.per
  return L
}

/** Огибающая импульса скорости 0…1…0 за PULSE_MS (синус: без изломов на краях); 0 — импульса нет */
export const pulseAt = pt => (pt >= PULSE_MS ? 0 : Math.sin((Math.PI * Math.max(0, pt)) / PULSE_MS))

/** Что рисовать: y — сдвиг пунктира (dvh), a — прозрачность штрихов (на импульсе скорости растёт до PULSE_A), sy — длина штрихов (1 … PULSE_DASH), phase */
export function laneLook(L) {
  const a = REST_A + (RUN_A - REST_A) * L.g, p = pulseAt(L.pt ?? PULSE_MS)
  return { y: L.y, a: p > 0 ? a + (Math.max(a, PULSE_A) - a) * p : a, sy: 1 + (PULSE_DASH - 1) * p, phase: L.phase }
}

/** Все дорожки стоят — привод можно усыпить */
export const settled = lanes => lanes.every(L => L.phase === 'idle' && (L.pt ?? PULSE_MS) >= PULSE_MS)
