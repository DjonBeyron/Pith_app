import { releaseTextSelection } from './canvasDragGuard.js'
import { NODE_HIT_W, NODE_HIT_H } from './canvasHitTest.js'

// Обработчики мыши самой доски (клики по пустому месту — клики по нодам сюда
// не долетают, там stopPropagation, см. handleNodeMouseDown в CanvasBoard.jsx).
// Вынесено из CanvasBoard.jsx: тот файл и так у потолка размера, а это была
// большая часть его кода вперемешку с разметкой.
//
// Порядок проверок — часть логики, не переставлять: порт → зона → рамка →
// обычная протяжка. Каждый следующий обработчик получает событие, только
// если предыдущий его не «поймал» (вернул false) — см. return в каждом.
export function useCanvasBoardPointer({
  toWorld, boardRectRef, measureBoard, nodes,
  setHoveredNodeId, setConfirmDeleteId,
  startCanvasDrag, startMarquee, updateMarquee, endMarquee,
  handlePortMouseMove, handlePortMouseUp,
  tryStartZoneDraw, tryUpdateZoneDraw, tryEndZoneDraw,
  onDragMouseMove, endDrag, wasDragged, collapseIfClick,
}) {
  function handleBoardMouseDown(e) {
    // Перед любой протяжкой сверяем, где сейчас доска на экране
    measureBoard()
    // Клик вне ноды и меню закрывает меню-липучку (и вопрос «Удалить?»)
    if (!e.target.closest?.('.canvasNodeWrapper')) {
      setHoveredNodeId(null)
      setConfirmDeleteId(null)
    }
    // Средняя кнопка — панорамирование холста (в т.ч. начатое над нодой).
    // Левая по пустому месту — рамка выделения, или, пока активен инструмент
    // «Зона», рисование новой зоны — а не панорамирование
    if (e.button === 1) {
      e.preventDefault()
      startCanvasDrag(e)
      return
    }
    if (e.button !== 0) return
    if (tryStartZoneDraw(e)) return
    startMarquee(e, () => boardRectRef.current)
  }

  function handleBoardMouseMove(e) {
    if (handlePortMouseMove(e)) return
    if (tryUpdateZoneDraw(e)) return
    const hitSize = n => ({ w: NODE_HIT_W[n.size] ?? 158, h: NODE_HIT_H[n.size] ?? 200 })
    if (updateMarquee(e, () => boardRectRef.current, toWorld, nodes, hitSize)) return
    onDragMouseMove(e)
  }

  function handleBoardMouseUp(e) {
    // Снимаем запрет выделения ЗДЕСЬ, а не в endDrag: у рамки и у протяжки
    // порта свои ранние выходы ниже, и класс на body остался бы висеть после
    // них навсегда — текст в нодах перестал бы выделяться вообще
    releaseTextSelection()
    if (tryEndZoneDraw()) return
    if (endMarquee()) return
    if (handlePortMouseUp(e)) return
    endDrag()
    collapseIfClick(wasDragged)
  }

  return { handleBoardMouseDown, handleBoardMouseMove, handleBoardMouseUp }
}
