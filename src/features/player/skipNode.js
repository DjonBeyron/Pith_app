// «Тихие» ноды: плеер не показывает их вовсе — ни сообщения, ни точек «печатает» перед ним, а сразу идёт по их связи дальше.
// Сейчас это lesson_ref без выбранного урока (targetId пуст): карточке-ссылке вести некуда. В режиме разбора такая нода рисуется
// пустым модулем-заглушкой (review/PlayerLikeFeed.jsx), чтобы автор видел, что ссылку забыли выбрать.
export const isSilentNode = node => node?.type === 'lesson_ref' && !node.typeData?.lesson_ref?.targetId

// Если node тихая — идём по первой связи (then) дальше, пока не встретим обычную ноду. Возвращает
//   { skipped: false } — node обычная, ничего не меняется;
//   { skipped: true, nextId } — nextId обычной ноды (или ссылки в никуда: её разберёт сам плеер),
//   { skipped: true, nextId: null } — цепочка тихих нод кончилась (или замкнулась): урок закончен.
export function skipSilent(nodeMap, node) {
  if (!isSilentNode(node)) return { skipped: false }
  const seen = new Set()
  let cur = node
  while (isSilentNode(cur) && !seen.has(cur.id)) {
    seen.add(cur.id)
    const then = (cur.triggers ?? []).find(t => t.then)?.then ?? null
    if (!then) return { skipped: true, nextId: null }
    if (!nodeMap[then]) return { skipped: true, nextId: then }
    cur = nodeMap[then]
  }
  return { skipped: true, nextId: isSilentNode(cur) ? null : cur.id }
}
