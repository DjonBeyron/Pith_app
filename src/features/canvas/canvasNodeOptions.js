// Список нод для дропдаунов внутри max-нод («Тогда → нода #N», «В ответ на»).
// Там нужны только id, seq, type и содержимое для превью — но НЕ координаты.
// Отдельный модуль, потому что от стабильности этой ссылки зависит, будут ли
// все ноды графа перерисовываться на каждом кадре протяжки (см. CanvasBoard).

// Отпечаток списка: меняется при добавлении/удалении ноды, смене её типа,
// номера или текста — и НЕ меняется, когда ноду просто двигают по холсту
export function nodeOptionsSignature(nodes) {
  let sig = ''
  for (const n of nodes) {
    const content = n.typeData?.[n.type]?.content
    sig += n.id + ':' + n.seq + ':' + n.type + ':' +
      (typeof content === 'string' ? content.slice(0, 28) : '') + '|'
  }
  return sig
}

export function pickNodeOptions(nodes) {
  return nodes.map(n => ({ id: n.id, seq: n.seq, type: n.type, typeData: n.typeData }))
}
