import { useState, useEffect } from 'react'

// Наведение на ноду и вопрос «Удалить?».
//
// Меню ноды — «липучка»: открывается по наведению и висит, пока не кликнут
// вне ноды/меню (закрытие — в onMouseDown доски) или не наведут другую ноду.
// Del на наведённой ноде открывает подтверждение удаления — но не тогда,
// когда курсор стоит в поле ввода: там Del стирает символ.
export function useCanvasHover(nodeDragging) {
  const [hoveredNodeId, setHoveredNodeId] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  function enterNode(nodeId) {
    // Во время протяжки нода проезжает под курсором мимо соседей — их меню
    // не должны мигать, а лишний setState на каждом кадре ни к чему
    if (nodeDragging) return
    // Вопрос «Удалить?» другой ноды сбрасывается при переходе на новую
    if (confirmDeleteId && confirmDeleteId !== nodeId) setConfirmDeleteId(null)
    setHoveredNodeId(nodeId)
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Delete') return
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return
      if (hoveredNodeId) setConfirmDeleteId(hoveredNodeId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hoveredNodeId])

  return { hoveredNodeId, setHoveredNodeId, confirmDeleteId, setConfirmDeleteId, enterNode }
}
