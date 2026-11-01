// Когда включать конвейер (v3.3.85; акты репетиции — v3.3.87): ОДИН источник момента «старт конвейера» — и для репетиции с планом, и для обычной ноды. Чистые функции: без React и DOM, проверяются тестами (wordLaneConveyorStart.test.js).
// Конвейер зажигается за CONVEYOR_LEAD_MS (1,2 с, 72 кадра: зажигание 300 мс + мягкий разгон 900 мс) до конца «последнего сигнала перед пилюлями», чтобы к выезду пилюли дорожка шла на рабочей скорости.
// Сигнал — конец реплики Пита (репетиция: озвученная реплика плашки, rehearsalConveyorCue.js; директор знает её длину и занятость кота) или конец отсчёта тремя нотами; без реплики (обычная нода, plan = null) —
// конец плашки (stage.ms). Момент считается от начала плашки (announce / turn), за которой идёт стадия с пилюлями: дорожки, на которых они поедут, — дорожки СЛЕДУЮЩЕЙ стадии (armedLanes).
// Репетиция с планом (v3.3.87, замечание владельца: конвейер не должен тормозить, пока говорит Пит): внутри АКТА (подряд идущие стадии с одним stage.act) конвейер едет непрерывно, на всех дорожках, где в акте будут пилюли
// (actLanes — объединение по стадиям акта; в разминке слово переезжает с дорожки на дорожку, и тормозить между словами нельзя); пилюли просто выезжают в нужных местах. Тормозит он только на границе акта (плашка следующего акта:
// до момента зажигания команды нет) и перед зеркалом и итогом (дорожек там нет). Команда акта — строка из '2' и '0' ('202'): '2' — «держать ход, пока акт идёт» (laneConveyorDrive), в отличие от '1' — «по пилюлям».
import { CONVEYOR_LEAD_MS } from './wordLaneConveyor.js'
import { runLanes, RUN_NONE } from './wordLaneRunLanes.js'

/** Через сколько мс после начала плашки зажигать конвейер: holdMs — сколько плашка держится (до смены стадии), cueMs — конец сигнала (реплика / отсчёт), null — сигнала нет, берём конец плашки. Не раньше нуля */
export function igniteAtMs({ holdMs, cueMs = null }) {
  const end = Math.min(holdMs, cueMs ?? holdMs)
  return Math.max(0, Math.round(end - CONVEYOR_LEAD_MS))
}

const isPlate = stage => stage?.type === 'announce' || stage?.type === 'turn'

/**
 * Какие дорожки «взведены» (строка '101'): на стадии с пилюлями — её дорожки, на плашке перед ней — дорожки следующей стадии, но только когда подошёл момент зажигания (ignited), иначе ни одной.
 * Сама ли дорожка поедет и когда остановится — решает модель (wordLaneConveyor.js): по пилюлям на дорожке.
 */
export function armedLanes({ stageObj, nextStage = null, ignited = false }) {
  const own = runLanes(stageObj)
  if (own !== RUN_NONE) return own
  return ignited && isPlate(stageObj) ? runLanes(nextStage) : RUN_NONE
}

/** Команда «акт идёт»: дорожка едет непрерывно, пока команда стоит (laneConveyorDrive.setArmed) */
export const KEEP_CHAR = '2'

/** Стадия stages[idx] — первая в своём акте (граница: до неё шёл другой акт или не было ничего) */
export const isActStart = (stages, idx) => !!stages[idx]?.act && stages[idx - 1]?.act !== stages[idx].act

/**
 * Дорожки акта, которому принадлежит stages[idx]: объединение дорожек всех его стадий с пилюлями (подряд идущих — сторона не важна: стадии одного акта в рецепте лежат подряд). Строка '101'.
 * Стадии, которые обходятся по правилам (cond), считаются тоже: лишняя дорожка в акте едет вхолостую, а нехватка оставила бы пилюлю без конвейера.
 */
export function actLanes(stages, idx) {
  const act = stages[idx]?.act
  if (!act) return RUN_NONE
  let from = idx, to = idx
  while (stages[from - 1]?.act === act) from -= 1
  while (stages[to + 1]?.act === act) to += 1
  const on = [false, false, false]
  for (let i = from; i <= to; i++) runLanes(stages[i]).split('').forEach((c, k) => { if (c === '1') on[k] = true })
  return on.map(v => (v ? KEEP_CHAR : '0')).join('')
}

/**
 * Какие дорожки «взведены» в репетиции: строка из '2' (держать ход) и '0'. Внутри акта — дорожки акта сразу (в том числе на плашках и между стадиями); на первой стадии акта, если это плашка, — ни одной
 * до момента зажигания (ignited, igniteAtMs), потом дорожки акта: ровно к концу реплики Пита / отсчёта дорожка уже на рабочей скорости. Первая стадия акта с пилюлями (не плашка) взводит дорожки акта сразу.
 * Стадии без пилюль в акте (зеркало, итог) — ни одной: дорожки тормозят.
 */
export function actArmedLanes({ stages, idx, ignited = false }) {
  const stage = stages[idx]
  if (!stage?.act) return RUN_NONE
  if (isActStart(stages, idx) && isPlate(stage) && !ignited) return RUN_NONE
  return actLanes(stages, idx)
}
