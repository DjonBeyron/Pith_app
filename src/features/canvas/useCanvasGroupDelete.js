import { useState } from 'react'

// Подтверждение удаления выделенной группы нод — плашка над холстом
// (CanvasSelectionToolbar.jsx). Вынесено из CanvasBoard.jsx отдельным хуком,
// чтобы не раздувать основной файл парой лишних строк состояния.
//
// Помним не флаг, а «слепок» выделения, на которое нажали «Удалить»: если
// после этого выделили другую группу нод, слепок перестаёт совпадать и
// подтверждение молча гаснет само — без лишнего useEffect с setState внутри.
function signature(ids) { return [...ids].sort().join(',') }

export function useCanvasGroupDelete(selectedIds, deleteNodesOp, clearSelection) {
  const [confirmingFor, setConfirmingFor] = useState(null)
  const confirmGroupDelete = confirmingFor !== null && confirmingFor === signature(selectedIds)

  function deleteSelectedGroup() {
    deleteNodesOp(selectedIds)
    clearSelection()
    setConfirmingFor(null)
  }

  return {
    confirmGroupDelete,
    askGroupDelete: () => setConfirmingFor(signature(selectedIds)),
    cancelGroupDelete: () => setConfirmingFor(null),
    deleteSelectedGroup,
  }
}
