// Разведение слипшихся нод по горизонтали.
//
// Ширина развёрнутой ноды выросла, а координаты уже расставленных графов
// остались от прежней — соседи по горизонтали наехали друг на друга. Здесь
// колонки раздвигаются так, чтобы между соседними снова был нормальный
// зазор: порядок и вертикаль не трогаем, меняем только x.

import { NODE_SLOT } from './nodeGraph.js'

// Ноды одной колонки стоят на близких x — собираем их вместе, чтобы колонка
// уехала целиком, а не рассыпалась
const COLUMN_TOLERANCE = 40

export function spreadNodes(nodes, slot = NODE_SLOT) {
  if (nodes.length < 2) return nodes

  const columns = []
  for (const x of [...new Set(nodes.map(n => n.x))].sort((a, b) => a - b)) {
    const last = columns[columns.length - 1]
    if (last && x - last.x <= COLUMN_TOLERANCE) last.members.push(x)
    else columns.push({ x, members: [x] })
  }

  // Первая колонка остаётся на месте, каждая следующая отодвигается на шаг,
  // но только если сейчас стоит ближе — граф, расставленный с запасом, не
  // сжимается
  const shift = new Map()
  let prevNewX = columns[0].x
  shift.set(columns[0].x, 0)
  for (const m of columns[0].members) shift.set(m, 0)

  for (let i = 1; i < columns.length; i++) {
    const col = columns[i]
    const newX = Math.max(col.x, prevNewX + slot)
    const delta = newX - col.x
    for (const m of col.members) shift.set(m, delta)
    prevNewX = newX
  }

  return nodes.map(n => {
    const delta = shift.get(n.x) ?? 0
    return delta ? { ...n, x: n.x + delta } : n
  })
}
