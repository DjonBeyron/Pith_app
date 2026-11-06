// Когда включать конвейер (v3.3.85; акты репетиции — v3.3.87): ОДИН источник момента «старт конвейера» — и для репетиции с планом, и для обычной ноды. Чистые функции: без React и DOM, проверяются тестами (wordLaneConveyorStart.test.js).
// Конвейер зажигается за CONVEYOR_LEAD_MS (1,2 с, 72 кадра: зажигание 300 мс + мягкий разгон 900 мс) до конца «последнего сигнала перед пилюлями», чтобы к выезду пилюли дорожка шла на рабочей скорости.
// Сигнал — конец реплики Пита (репетиция: озвученная реплика плашки, rehearsalConveyorCue.js; директор знает её длину и занятость кота) или конец отсчёта тремя нотами; без реплики (обычная нода, plan = null) —
// конец плашки (stage.ms). Момент считается от начала плашки (announce / turn), за которой идёт стадия с пилюлями: дорожки, на которых они поедут, — дорожки СЛЕДУЮЩЕЙ стадии (armedLanes).
// Репетиция с планом (v3.3.101; в v3.3.87 едва ли не весь акт ехал на всех его дорожках — в разминке слова идут на разных дорожках, и по экрану бежали две-три без дела): едет только дорожка, на которой сейчас пилюли, и та,
// где они будут следующими: следующая зажигается заранее (за CONVEYOR_LEAD_MS до выезда своей пилюли), прежняя тормозит, когда её пилюли ушли. Непрерывно едет лишь дорожка, на которой пилюли идут подряд (ступень сборки
// и следующая, диктор и «твоя очередь» на тех же дорожках). Команда — строка из '2' («держать ход, пока команда стоит», laneConveyorDrive), '1' («по пилюлям»: тормозит, когда они ушли) и '0'.
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

const isPill = stage => runLanes(stage) !== RUN_NONE
const lanesOf = str => str.split('').map((c, k) => (c === '1' ? k : -1)).filter(k => k >= 0)
const join = (on, keep = on) => [0, 1, 2].map(k => (keep.includes(k) ? KEEP_CHAR : on.includes(k) ? '1' : '0')).join('')

/** Команда «акт идёт»: дорожка едет непрерывно, пока команда стоит (laneConveyorDrive.setArmed) */
export const KEEP_CHAR = '2'

/** Стадия stages[idx] — первая в своём акте (граница: до неё шёл другой акт или не было ничего) */
export const isActStart = (stages, idx) => !!stages[idx]?.act && stages[idx - 1]?.act !== stages[idx].act

/** Дорожки ближайшей после stages[idx] стадии с пилюлями В ТОМ ЖЕ АКТЕ (через плашки; nextIdx — правила пропуска стадий репетиции) — массив номеров дорожек, пусто — дальше пилюль в акте нет */
export function upcomingLanes(stages, idx, nextIdx = i => i) {
  const act = stages[idx]?.act
  for (let j = nextIdx(idx + 1), n = 0; act && stages[j]?.act === act && n < stages.length; j = nextIdx(j + 1), n++) if (isPill(stages[j])) return lanesOf(runLanes(stages[j]))
  return []
}

/** Дорожки последней стадии с пилюлями этого акта перед stages[idx] (через плашки) — по ним до плашки ехал конвейер */
export function previousLanes(stages, idx) {
  const act = stages[idx]?.act
  for (let j = idx - 1; act && stages[j]?.act === act; j--) if (isPill(stages[j])) return lanesOf(runLanes(stages[j]))
  return []
}

/**
 * Какие дорожки «взведены» в репетиции: строка из '2' (держать ход), '1' (по пилюлям) и '0'.
 *  • стадия с пилюлями: её дорожки — '2'; когда она кончается (leaving — движок сказал «ступень закончена», до следующей стадии ещё пауза 1,3 с) — дорожки следующей стадии акта зажигаются заранее ('2'),
 *    а те, которые следующей не нужны, переходят на '1' и тормозят, когда их пилюли ушли;
 *  • плашка внутри акта (announce / turn): едут дорожки, где пилюли идут подряд (были до плашки и будут после) — они не тормозят; дорожки следующей стадии, на которых пилюль ещё не было, — после момента зажигания
 *    (ignited, igniteAtMs: ровно к концу реплики Пита / отсчёта дорожка на рабочей скорости); остальные — '0'. На первой плашке акта до зажигания команды нет совсем;
 *  • зеркало, итог — ни одной: дорожки тормозят.
 */
export function actArmedLanes({ stages, idx, ignited = false, leaving = false, nextIdx }) {
  const stage = stages[idx]
  if (!stage?.act) return RUN_NONE
  if (isPill(stage)) {
    const own = lanesOf(runLanes(stage))
    const next = leaving ? upcomingLanes(stages, idx, nextIdx) : []
    return join([...own, ...next], [...own.filter(k => !leaving || next.includes(k)), ...next])
  }
  if (!isPlate(stage) || (isActStart(stages, idx) && !ignited)) return RUN_NONE
  const prev = previousLanes(stages, idx)
  const next = upcomingLanes(stages, idx, nextIdx)
  return join(next.filter(k => ignited || prev.includes(k)))
}

/** «Встряхни память» (v3.3.129): четвёртый знак команды — игра идёт, дорожки между этапами не встают, а едут медленно (laneConveyorDrive → модель slow) */
export const SLOW_CHAR = 's'

/**
 * Команда гонки с «медленным ходом»: пока игра идёт (стадия гонки, не итог) и конвейер уже запускался (сейчас едет или раньше была стадия с пилюлями), к команде lanes дописывается SLOW_CHAR —
 * на плашках, «Секунду», доп. круге и между проходами дорожки не встают. Пауза (stage 'paused'), итог, финал и всё до первого запуска — без него: дорожки тормозят до покоя.
 */
export function raceSlowLanes({ lanes, stages, idx, stage }) {
  const cur = stage === 'run' ? stages?.[idx] : null
  if (!cur?.race || cur.type === 'summary') return lanes
  const started = /[12]/.test(lanes) || stages.slice(0, idx).some(isPill)
  return started ? lanes + SLOW_CHAR : lanes
}
