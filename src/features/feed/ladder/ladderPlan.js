import { effectiveDifficulty } from '../../../shared/lib/level/effectiveDifficulty.js'
import { seededUnit } from '../../../shared/lib/ranking/seeded.js'
import { LADDER_SHAPE, LADDER_MIN_STEPS } from './ladderRules.js'

// План лесенки (чистая функция): из модулей ленты выбирает до 5 фраз по нарастанию сложности.
// Берём только подходящие: не песочница, не превью («Изучить фразу» скрыта), не из exclude (начатые и т. п.),
// с ИЗВЕСТНОЙ эффективной сложностью (голоса от порога либо сложность админа). Внутри одной сложности порядок
// детерминированный по сиду дня (seededUnit) — в течение дня тот же, на другой день другие фразы.
// → [{ id, difficulty }] в порядке показа либо null, если лесенку не построить (нет средних, мало фраз)
export function planLadder(modules, { exclude = new Set(), seed = 1 } = {}) {
  const groups = { 1: [], 2: [], 3: [] }
  for (const m of modules ?? []) {
    if (!m?.id || m.isSandbox || m.previewOnly || exclude.has(m.id)) continue
    const d = effectiveDifficulty(m)
    if (d) groups[d].push(m)
  }
  if (!groups[2].length) return null
  const [easy, mid, hard] = groups[3].length ? LADDER_SHAPE.withHard : LADDER_SHAPE.noHard
  const pick = (list, n) => [...list]
    .map(m => ({ m, u: seededUnit(seed, m.id) }))
    .sort((a, b) => a.u - b.u || (a.m.id < b.m.id ? -1 : 1))
    .slice(0, n)
    .map(x => x.m)
  const steps = [
    ...pick(groups[1], easy).map(m => ({ id: m.id, difficulty: 1 })),
    ...pick(groups[2], mid).map(m => ({ id: m.id, difficulty: 2 })),
    ...pick(groups[3], hard).map(m => ({ id: m.id, difficulty: 3 })),
  ]
  return steps.length >= LADDER_MIN_STEPS ? steps : null
}

// План по сохранённым id (перезагрузка в тот же день): те же фразы, что ещё есть в ленте, в прежнем порядке
export function planFromIds(ids, modules) {
  const byId = new Map((modules ?? []).map(m => [m.id, m]))
  return (ids ?? [])
    .map(id => ({ id, difficulty: effectiveDifficulty(byId.get(id)) }))
    .filter(s => s.difficulty)
}

// Лесенка первыми: фразы плана (те, что есть в списке) в порядке плана, остальные — как были, без дублей.
// Нет ни одной фразы плана в списке — тот же массив
export function putLadderFirst(modules, plan) {
  if (!plan?.length) return modules
  const byId = new Map(modules.map(m => [m.id, m]))
  const first = plan.map(s => byId.get(s.id)).filter(Boolean)
  if (!first.length) return modules
  const ids = new Set(first.map(m => m.id))
  return [...first, ...modules.filter(m => !ids.has(m.id))]
}
