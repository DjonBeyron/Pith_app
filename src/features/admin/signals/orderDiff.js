// Сравнение порядков ленты для предпросмотра окна «Сигналы ленты». Чистые функции
// над массивами модулей (или { module }) — ничего не знают о React и сигналах.

const idOf = x => (x?.module ?? x)?.id

// Map id → позиция (с 1)
export function positionsById(list) {
  const m = new Map()
  ;(list ?? []).forEach((x, i) => { const id = idOf(x); if (id != null && !m.has(id)) m.set(id, i + 1) })
  return m
}

// Сдвиг каждого элемента list относительно base: delta > 0 — поднялся (был ниже),
// delta < 0 — опустился, isNew — в base его не было
export function orderShift(list, base) {
  const basePos = positionsById(base)
  return (list ?? []).map((x, i) => {
    const id = idOf(x)
    const pos = i + 1
    const was = basePos.get(id)
    return { id, pos, basePos: was ?? null, delta: was ? was - pos : 0, isNew: !was }
  })
}

// Метка сдвига для бейджа: «↑3», «↓2», «новый», '' (без изменений)
export function shiftLabel(s) {
  if (!s) return ''
  if (s.isNew) return 'новый'
  if (s.delta > 0) return `↑${s.delta}`
  if (s.delta < 0) return `↓${-s.delta}`
  return ''
}

// id элементов, у которых позиция изменилась (или которые появились) — подсветка после правки
export function changedIds(list, prev, limit = Infinity) {
  const out = new Set()
  for (const s of orderShift(list, prev).slice(0, limit)) if (s.isNew || s.delta !== 0) out.add(s.id)
  return out
}

// Сколько позиций из первых n различаются между двумя порядками
export function topDifference(a, b, n = 20) {
  const pa = (a ?? []).slice(0, n).map(idOf), pb = (b ?? []).slice(0, n).map(idOf)
  let diff = 0
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if (pa[i] !== pb[i]) diff++
  return diff
}
