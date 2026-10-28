import { useState } from 'react'
import { nodeBox } from './canvasPorts.js'

// Виртуализация холста: в DOM стоят только ноды, что в кадре и рядом. Урок на 300 нод — это ~25 тысяч узлов DOM и больше секунды на отрисовку, а на
// экране в каждый момент десятки нод. Связи рисуются по данным ВСЕХ нод (не по DOM), выделение/протяжка тоже считаются по данным, поэтому от того,
// что ноды вне кадра не отрисованы, они не меняются. Замеры строк «Тогда» живут в состоянии доски по id и переживают размонтирование ноды.
// Гистерезис: нода входит в DOM, когда подошла ближе ENTER_MARGIN кадров, и уходит, только отъехав дальше STAY_MARGIN, — на краю не мигает.
// Выбранные/наведённые/в «прожекторе»/под вопросом удаления остаются в DOM всегда (keep)
export const ENTER_MARGIN = 0.6
export const STAY_MARGIN = 1.6

function inFrame(box, view, margin) {
  const mx = view.vw / view.scale * margin
  const my = view.vh / view.scale * margin
  const left = -view.offset.x / view.scale - mx
  const top = -view.offset.y / view.scale - my
  const right = (view.vw - view.offset.x) / view.scale + mx
  const bottom = (view.vh - view.offset.y) / view.scale + my
  return box.right >= left && box.left <= right && box.bottom >= top && box.top <= bottom
}

/** id нод, которые должны стоять в DOM. prev — множество, стоявшее до этого (для гистерезиса); keep — id, которые держим всегда */
export function computeMounted(nodes, view, prev, keep, triggerMeasures = {}) {
  const out = new Set()
  for (const n of nodes) {
    if (keep.has(n.id)) { out.add(n.id); continue }
    const box = nodeBox(n, triggerMeasures)
    if (inFrame(box, view, prev.has(n.id) ? STAY_MARGIN : ENTER_MARGIN)) out.add(n.id)
  }
  return out
}

const sameSet = (a, b) => a.size === b.size && [...a].every(id => b.has(id))

export function useVisibleNodes(nodes, offset, scale, { size, triggerMeasures, keep }) {
  const [prev, setPrev] = useState(() => new Set())
  const view = { offset, scale, vw: size.w, vh: size.h }
  const next = computeMounted(nodes, view, prev, keep, triggerMeasures)
  if (!sameSet(prev, next)) setPrev(next) // состояние, выведенное из пропсов: React сразу перерисует без промежуточного кадра
  return nodes.filter(n => next.has(n.id))
}
