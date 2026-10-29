// Журнал актов репетиции: что случилось на каждой ступени ученика (принято / чужое слово / не успел). По нему решаются правила пропуска (повтор ступени, сокращение акта 4, пропуск «Различи»),
// подсказки в акте «без текста» и итог (rehearsalSim.js). Чистые функции — проверяются тестами; в игре журнал живёт в ref хука useRehearsalActs.
import { MANY_MISSES, PRE_BLIND_ACTS } from './rehearsalRecipe.js'

export const createJournal = () => ({ stages: {} })

const slot = (j, stage) => (j.stages[stage.sid] ??= { act: stage.act, win: 0, miss: 0, fail: 0 })

/** kind: 'win' — пилюля принята; 'miss' — сказано не то; 'fail' — не успел */
export function record(j, stage, kind) {
  if (!stage?.sid || !(kind in { win: 1, miss: 1, fail: 1 })) return
  slot(j, stage)[kind] += 1
}

export const winsOf = (j, sid) => j.stages[sid]?.win ?? 0
/** Промахи ступени: чужие слова и «не успел» вместе */
export const badOf = (j, sid) => (j.stages[sid]?.miss ?? 0) + (j.stages[sid]?.fail ?? 0)
/** Ступень пройдена чисто: хоть что-то принято и промахов не было */
export const cleanOf = (j, sid) => winsOf(j, sid) > 0 && badOf(j, sid) === 0

/** Сколько промахов набралось в актах acts (по умолчанию — всё, что до акта 4) */
export function missesIn(j, acts = PRE_BLIND_ACTS) {
  return Object.values(j.stages).filter(x => acts.includes(x.act)).reduce((a, x) => a + x.miss + x.fail, 0)
}

/** Идти ли на эту стадию: у стадий без cond — всегда; cond.retry — только если у ступени с этим sid был промах (повтор ступени, один раз); cond.few — только пока промахов к акту 4 меньше MANY_MISSES */
export function shouldRun(stage, j) {
  const c = stage?.cond
  if (!c) return true
  if (c.retry) return badOf(j, c.retry) > 0
  if (c.few) return missesIn(j) < MANY_MISSES
  return true
}

/** Первая стадия с номером ≥ from, на которую идём (пропущенные по cond обходятся) */
export function nextRunnable(stages, from, j) {
  let i = from
  while (i < stages.length && !shouldRun(stages[i], j)) i += 1
  return i
}

/** Дорожки (куски), где слово разминки не далось дважды: в акте «без текста» у них показывается подпись */
export function weakLanes(j, stages) {
  const lanes = new Set()
  for (const s of stages) if (s.type === 'warmup' && s.act === 'warmup' && badOf(j, s.sid) >= 2) lanes.add(s.word.lane)
  return [...lanes]
}
