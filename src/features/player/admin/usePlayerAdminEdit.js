import { useState, useMemo } from 'react'

// Режим правки урока прямо из плеера. Включается ТОЛЬКО когда плеер запущен
// из канваса админом: CanvasPage передаёт объект edit ({ onUpdateNode, ... }),
// во всех остальных местах (лента, уроки, гонка) проп не передаётся вовсе —
// ни кнопок, ни панели там не появляется.
//
// Правки уходят в ноды холста (CanvasBoard через ref) и возвращаются в плеер
// обычным пропом nodes — на сервер попадают только по «Сохранить» в канвасе.
export function usePlayerAdminEdit(edit, nodes, visibleNodes) {
  const enabled = !!edit?.onUpdateNode
  const [editId, setEditId] = useState(null)

  // Нода, которая сейчас в чате последняя — «текущая» для кнопки ⌖ в панели
  const currentId = visibleNodes.length ? visibleNodes[visibleNodes.length - 1].id : null

  // Ноду удалили из холста, пока панель была открыта — find вернёт null, и
  // панель покажет подсказку вместо редактора несуществующей ноды
  const editNode = useMemo(
    () => (editId ? nodes.find(n => n.id === editId) ?? null : null),
    [editId, nodes],
  )

  return {
    enabled,
    editId,
    editNode,
    currentId,
    open: setEditId,
    close: () => setEditId(null),
    openCurrent: () => setEditId(currentId),
  }
}
