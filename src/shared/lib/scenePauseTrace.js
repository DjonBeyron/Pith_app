// «Какая настройка дала паузу» — метка в трассе сцены (CONCEPT_TIMELINE.md, «Шаг 2»). Игра ставит таймер по настройке из реестра (scenePauses.js) и тут же пишет событие
//   { t, k: 'knob', key, ms, from?, until?, sid?, set? } — «с этого мгновения идёт ожидание по настройке key длиной ms»: from — что было перед (rise, praise, claim, missed, реплика …),
//   until — чего ждём (praise, say, next-stage, next-line …), sid — стадия, set: true — значение переопределено (не по умолчанию).
// Только запись: не бросает, логику игры не меняет. Паузы, запечённые в стадию при сборке (stage.ms, stage.pause, stage.lineTail), едут в событии stage-in полем pauses (wordLaneSceneTrace.sceneStage).
import { scenePush } from './sceneTrace.js'
import { pauseMs, PAUSE_DEFAULTS } from './scenePauses.js'

/** Отметить ожидание по настройке key (значение — действующее или ms, если его уже посчитали) */
export function sceneKnob(key, info = {}, ms = pauseMs(key)) {
  try { scenePush('knob', { key, ms, ...info, ...(ms !== PAUSE_DEFAULTS[key] ? { set: true } : {}) }) } catch { /* трасса не мешает игре */ }
}

/** Значение настройки key для таймера + отметка в трассе: setTimeout(fn, knobMs('good.delay', { from: 'rise', until: 'praise' })) */
export function knobMs(key, info) {
  const ms = pauseMs(key)
  sceneKnob(key, info, ms)
  return ms
}

/** Паузы, запечённые в стадию (stage.knobs: { поле стадии или роль: ключ реестра }) → [{ key, ms, as }] для события stage-in. Поле стадии есть — берётся оно (то, что реально запеклось), иначе действующее значение */
export function stagePauses(st) {
  const out = []
  for (const [as, key] of Object.entries(st?.knobs ?? {})) { const ms = typeof st[as] === 'number' ? st[as] : pauseMs(key); out.push({ key, ms, as, ...(ms !== PAUSE_DEFAULTS[key] ? { set: true } : {}) }) }
  return out
}
