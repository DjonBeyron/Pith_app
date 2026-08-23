import { renumber, makeNode, findFreeSpot, NODE_SLOT, NODE_ROW } from './nodeGraph.js'

// Мутации массива нод для hover-меню канваса (удалить/дублировать/вставить
// после) — вынесены из CanvasBoard.jsx (только setNodes как зависимость,
// самодостаточны), чтобы не раздувать основной файл.
export function useCanvasNodeOps(setNodes) {
  function deleteNode(nodeId) {
    setNodes(prev => renumber(
      prev
        .filter(n => n.id !== nodeId)
        .map(n => ({
          ...n,
          triggers: n.triggers.map(t => ({ ...t, then: t.then === nodeId ? null : t.then })),
        }))
    ))
  }

  // Освобождает место под дубликат: всё, что правее x, уезжает на слот вправо.
  // Вставка новой ноды («+» и точка на порте) соседей НЕ двигает — она ищет
  // свободное место рядом (findFreeSpot в nodeGraph.js)
  function shiftRight(list, x) {
    return list.map(n => n.x > x ? { ...n, x: n.x + NODE_SLOT } : n)
  }

  // Дубликат встраивается в цепочку сразу после оригинала: все выходы оригинала
  // переключаются на копию, копия наследует прежние выходы. Вход остаётся на
  // оригинале: A → B → B' → C. Номера пересчитывает renumber, соседи справа
  // сдвигаются, освобождая место.
  function duplicateNode(nodeId) {
    setNodes(prev => {
      const node = prev.find(n => n.id === nodeId)
      if (!node) return prev
      const copy = {
        ...node,
        id: crypto.randomUUID(),
        x: node.x + NODE_SLOT,
        y: node.y,
        typeData: structuredClone(node.typeData ?? {}),
        triggers: (node.triggers ?? []).map(t => ({ ...t, id: crypto.randomUUID() })),
      }
      const updated = shiftRight(prev, node.x).map(n => n.id !== nodeId ? n : {
        ...n,
        triggers: n.triggers.map(t => t.then ? { ...t, then: copy.id } : t),
      })
      return renumber([...updated, copy])
    })
  }

  function insertAfterNode(nodeId, type) {
    setNodes(prev => {
      const node = prev.find(n => n.id === nodeId)
      if (!node) return prev
      const insertSeq = node.seq + 1
      const nextNode  = prev.find(n => n.seq === insertSeq) ?? null
      // Рядом с исходной, с отступом вправо; занято — ниже. Соседей не трогаем
      const spot      = findFreeSpot(prev, node.x + NODE_SLOT, node.y)
      const newNode   = makeNode(insertSeq, spot.x, spot.y, type)
      // middle insert: новая нода ведёт на следующую своим первым триггером
      if (nextNode) {
        newNode.triggers = newNode.triggers.map((t, ti) =>
          ti === 0 ? { ...t, then: nextNode.id } : t)
      }
      const updated = prev.map(n => {
        let out = n.seq >= insertSeq ? { ...n, seq: n.seq + 1 } : n
        if (n.id === nodeId) {
          if (nextNode) {
            // middle insert: rewire existing trigger A→B to A→new→B
            out = { ...out, triggers: out.triggers.map(t => ({
              ...t, then: t.then === nextNode.id ? newNode.id : t.then,
            }))}
          } else {
            // tail insert: заполняем первый свободный триггер ноды (у word_choice /
            // phrase_assembly / photo_choice свои пары correct/wrong — чужой 'played'
            // добавлял бы лишний порт). Только если все заняты — добавляем 'played'.
            const freeIdx = out.triggers.findIndex(t => !t.then)
            out = freeIdx >= 0
              ? { ...out, triggers: out.triggers.map((t, ti) =>
                  ti === freeIdx ? { ...t, then: newNode.id } : t) }
              : { ...out, triggers: [...out.triggers, { if: 'played', then: newNode.id }] }
          }
        }
        return out
      })
      return renumber([...updated, newNode])
    })
  }

  // Клик по выходному кружку: создаём ноду выбранного типа и вешаем её
  // именно на этот триггер (у развилки важно, на какой из выходов).
  //
  // Место освобождаем только для ПЕРВОЙ ветки ноды: у «выбери слово» выходов
  // много, и если расталкивать граф на каждый, соседи уезжали бы всё дальше
  // вправо. Вторая и следующие ветки встают в ту же колонку, но ниже.
  function insertFromPort(nodeId, triggerIdx, type) {
    setNodes(prev => {
      const node = prev.find(n => n.id === nodeId)
      if (!node) return prev
      const insertSeq = node.seq + 1
      const linked = (node.triggers ?? [])
        .filter(t => t.then)
        .map(t => prev.find(n => n.id === t.then))
        .filter(Boolean)
      const first = linked.length === 0
      const y = first ? node.y : Math.max(...linked.map(n => n.y)) + NODE_ROW
      const spot = findFreeSpot(prev, node.x + NODE_SLOT, y)
      const newNode = makeNode(insertSeq, spot.x, spot.y, type)
      const updated = prev.map(n => {
        let out = n.seq >= insertSeq ? { ...n, seq: n.seq + 1 } : n
        if (n.id === nodeId) {
          out = { ...out, triggers: out.triggers.map((t, ti) =>
            ti === triggerIdx ? { ...t, then: newNode.id } : t) }
        }
        return out
      })
      return renumber([...updated, newNode])
    })
  }

  return { deleteNode, duplicateNode, insertAfterNode, insertFromPort }
}
