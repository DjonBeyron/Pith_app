// «В этот момент» для указателя монтажа: что происходит в игре в момент t — какой этап, кто и что говорит, какая пилюля на экране, сколько длится текущая тишина. И шаги указателя по клипам (клавиши ← →).
// Чистые функции без React.
const at = (items, t) => items.filter(x => x.t <= t && t < x.end)

/** Монтаж + момент t (мс) → { stage, stageMs, speaking: [клипы], gap (кусок тишины) | null, gapMs, group, pills, marks, before, after } */
export function nowAt(mont, t) {
  const stage = mont.stages.findLast(s => s.t <= t) ?? null
  const speaking = at(mont.clips, t)
  const gap = speaking.length ? null : mont.gaps.find(g => g.t <= t && t < g.end) ?? null
  const group = gap ? mont.groups.find(g => g.g === gap.g) ?? null : null
  return {
    t, stage, stageMs: stage ? t - stage.t : 0, speaking, gap, gapMs: gap ? t - gap.t : 0, group, groupMs: group ? t - group.t : 0,
    pills: at(mont.pills, t), marks: at(mont.marks, t),
    before: mont.clips.findLast(c => c.end <= t) ?? null, after: mont.clips.find(c => c.t > t) ?? null,
  }
}

/** Куда прыгает указатель: dir −1 — начало предыдущего клипа, +1 — следующего; клипов дальше нет — начало / конец игры */
export function stepClip(mont, t, dir) {
  if (dir > 0) return mont.clips.find(c => c.t > t + 0.5)?.t ?? mont.dur
  return mont.clips.findLast(c => c.t < t - 0.5)?.t ?? 0
}
