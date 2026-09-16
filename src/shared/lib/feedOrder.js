// Порядок ленты чата: обычные ноды сценария (visibleNodes) и сигнальные
// сообщения (useSignalMessages.js) должны идти вперемешку в ТОМ порядке, в
// котором они реально появились, а не двумя раздельными блоками (сигналы
// были раньше жёстко ПОСЛЕ всей обычной ленты — из-за этого сигнал,
// сработавший до того, как ученик дособрал верный ответ, оказывался в чате
// НИЖЕ более поздних сообщений о верном ответе — путал хронологию).
//
// afterVisibleCount — сколько нод сценария уже было видно в момент, когда
// сигнал сработал (см. fire() в useSignalMessages.js) — чистое число, не
// временная метка: этого достаточно, чтобы вставить сигнал точно между
// нужной парой обычных нод, даже если несколько сигналов сработали между
// одной и той же парой (тогда они идут в порядке своего срабатывания).
export function mergeFeedOrder(visibleNodes, signalItems) {
  const bySlot = new Map()
  for (const item of signalItems ?? []) {
    const slot = item.afterVisibleCount ?? 0
    if (!bySlot.has(slot)) bySlot.set(slot, [])
    bySlot.get(slot).push(item)
  }

  const entries = []
  const pushSignalsAt = count => {
    for (const item of bySlot.get(count) ?? []) {
      entries.push({ kind: 'signal', key: item.key, node: item.node })
    }
  }

  pushSignalsAt(0)
  ;(visibleNodes ?? []).forEach((node, i) => {
    entries.push({ kind: 'node', node })
    pushSignalsAt(i + 1)
  })

  return entries
}
