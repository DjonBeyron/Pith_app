// Когда включать конвейер (v3.3.85): ОДИН источник момента «старт конвейера» — и для репетиции с планом, и для обычной ноды. Чистые функции: без React и DOM, проверяются тестами (wordLaneConveyorStart.test.js).
// Конвейер зажигается за CONVEYOR_LEAD_MS (≈ 40 кадров, 0,66 с: зажигание 240 мс + разгон 420 мс) до конца «последнего сигнала перед пилюлями», чтобы к выезду пилюли дорожка шла на рабочей скорости.
// Сигнал — конец реплики Пита (репетиция: озвученная реплика плашки, rehearsalConveyorCue.js; директор знает её длину и занятость кота) или конец отсчёта тремя нотами; без реплики (обычная нода, plan = null) —
// конец плашки (stage.ms). Момент считается от начала плашки (announce / turn), за которой идёт стадия с пилюлями: дорожки, на которых они поедут, — дорожки СЛЕДУЮЩЕЙ стадии (armedLanes).
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
