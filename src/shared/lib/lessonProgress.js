// Прогресс прохождения урока — для тонкой полосы в шапке плеера.
//
// Считать «показано нод / всего нод» нельзя: в уроке есть побочные ветки
// (разборы ошибок, вторая дорожка после промаха), и большинство их ученик не
// увидит никогда. На уроке из 125 нод главная линия — 99, и такая полоса
// упёрлась бы в 80% на самом финале.
//
// Поэтому меряем по ГЛАВНОЙ ЛИНИИ: обходим граф от входа, каждый раз беря
// первый триггер с переходом, и запоминаем порядковый номер каждой ноды в этой
// цепочке. Прогресс — самый дальний номер среди уже показанных. Ветки при этом
// не мешают и не обнуляют: они не попадают в карту, а рано или поздно вливаются
// обратно в главную линию, и с этого момента номер снова растёт.
export function mainLineIndex(nodes) {
  const byId = new Map((nodes ?? []).map(n => [n.id, n]))
  const index = new Map()
  // Вход — тот же, что у плеера: нода, в которую никто не ведёт
  const targets = new Set()
  for (const n of nodes ?? []) for (const t of n.triggers ?? []) if (t.then) targets.add(t.then)
  let cur = (nodes ?? []).find(n => !targets.has(n.id))?.id ?? nodes?.[0]?.id
  let i = 0
  // Ограничитель: у урока с циклом обход иначе не кончится
  while (cur && !index.has(cur) && i < 5000) {
    index.set(cur, i++)
    cur = (byId.get(cur)?.triggers ?? []).find(t => t.then)?.then
  }
  return index
}

// Доля пройденного, 0..1. Ноды вне главной линии просто не двигают полосу
export function lessonProgress(index, visibleNodes) {
  const last = index.size - 1
  if (last <= 0) return 0
  let far = 0
  for (const n of visibleNodes ?? []) {
    const at = index.get(n.id)
    if (at != null && at > far) far = at
  }
  return Math.min(1, far / last)
}
