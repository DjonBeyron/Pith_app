// «Применить» в окне «Разбор урока»: что изменилось в копии нод относительно основного холста. Чистые функции.
// Переносим правки СУЩЕСТВУЮЩИХ нод (параметры, переходы, заметка, размер, положение); добавленные и удалённые ноды считаем отдельно —
// их в основной урок автоматически не переносим (безопаснее: удаление ноды тянет за собой файлы)
const FIELDS = ['typeData', 'triggers', 'note', 'size', 'x', 'y', 'type']
// id у переходов холст выдаёт сам (новые случайные при нормализации) — для сравнения не учитываем
const plain = (f, v) => (f === 'triggers' && Array.isArray(v) ? v.map(t => Object.fromEntries(Object.entries(t).filter(([k]) => k !== 'id'))) : v)
const same = (f, a, b) => JSON.stringify(plain(f, a) ?? null) === JSON.stringify(plain(f, b) ?? null)

export function diffNodes(base, draft) {
  const baseById = new Map(base.map(n => [n.id, n]))
  const draftIds = new Set(draft.map(n => n.id))
  const changed = []
  for (const n of draft) {
    const b = baseById.get(n.id)
    if (!b) continue
    const patch = {}
    for (const f of FIELDS) if (!same(f, n[f], b[f])) patch[f] = n[f]
    if (Object.keys(patch).length) changed.push({ id: n.id, patch })
  }
  return {
    changed,
    added: draft.filter(n => !baseById.has(n.id)).length,
    removed: base.filter(n => !draftIds.has(n.id)).length,
  }
}
