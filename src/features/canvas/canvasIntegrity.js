// Проверка целостности графа урока: то, что ломает переходы и в редакторе, и
// в плеере, но глазами не видно.
//
// Главный подозреваемый — ДУБЛИ id. Если две ноды делят один id, связь на
// него ведёт «в никуда конкретно»: линия рисуется к первой попавшейся, плеер
// уходит не туда, а новая связь, созданная руками, ведёт себя так же — урок
// выглядит «заражённым».
export function checkNodes(nodes) {
  const list = nodes ?? []
  const seen = new Map()
  const dupIds = []
  for (const n of list) {
    if (seen.has(n.id)) dupIds.push(n.id)
    else seen.set(n.id, n)
  }

  const ids = new Set(list.map(n => n.id))
  const dangling = []
  const dupTriggerIds = []
  const trigSeen = new Set()
  for (const n of list) {
    for (const t of n.triggers ?? []) {
      if (t.then && !ids.has(t.then)) dangling.push(`#${n.seq}:${t.if}→${String(t.then).slice(0, 8)}`)
      if (t.id) {
        if (trigSeen.has(t.id)) dupTriggerIds.push(t.id)
        else trigSeen.add(t.id)
      }
    }
  }

  const seqCount = new Map()
  for (const n of list) seqCount.set(n.seq, (seqCount.get(n.seq) ?? 0) + 1)
  const dupSeq = [...seqCount.entries()].filter(([, c]) => c > 1).map(([s]) => s)

  const noId = list.filter(n => !n.id).length
  const noTriggers = list.filter(n => !Array.isArray(n.triggers)).length

  return {
    total: list.length,
    dupIds: [...new Set(dupIds)],
    dangling,
    dupTriggerIds: [...new Set(dupTriggerIds)],
    dupSeq,
    noId,
    noTriggers,
    ok: !dupIds.length && !dangling.length && !noId && !noTriggers,
  }
}

export function formatIntegrity(r) {
  if (r.ok) return `граф цел: ${r.total} нод`
  return [
    `граф С ПРОБЛЕМАМИ (${r.total} нод):`,
    r.dupIds.length ? `дубли id: ${r.dupIds.length} (${r.dupIds.slice(0, 3).map(s => String(s).slice(0, 8)).join(', ')})` : null,
    r.dangling.length ? `связи в никуда: ${r.dangling.length} (${r.dangling.slice(0, 3).join(', ')})` : null,
    r.dupTriggerIds.length ? `дубли id триггеров: ${r.dupTriggerIds.length}` : null,
    r.dupSeq.length ? `дубли номеров: ${r.dupSeq.slice(0, 5).join(', ')}` : null,
    r.noId ? `нод без id: ${r.noId}` : null,
    r.noTriggers ? `нод без массива триггеров: ${r.noTriggers}` : null,
  ].filter(Boolean).join(' · ')
}
