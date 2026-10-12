import { forwardRef, useImperativeHandle, useRef } from 'react'
import CanvasBoard from '../CanvasBoard.jsx'

// Полноценный холст внутри окна «Разбор урока»: тот же CanvasBoard, что на странице канваса, но со СВОЕЙ копией нод (lessonId=null —
// черновик в браузере не пишется, основной урок не трогается). Правки живут здесь, пока не нажато «Применить». focus(id) ставит
// холст на ноду и выделяет её — вызывается при каждом выборе в ленте, поэтому после того как ноду отодвинули, повторный клик возвращает её
const EmbeddedCanvas = forwardRef(function EmbeddedCanvas({ initialNodes, initialZones, boardProps, onNodesChange, onZonesChange }, ref) {
  const boardRef = useRef(null)
  useImperativeHandle(ref, () => ({
    focus: id => boardRef.current?.focusNodeTop(id),
    getNodes: () => boardRef.current?.getNodes() ?? [],
  }), [])
  return (
    <div className="rvwBoardWrap">
      <CanvasBoard
        ref={boardRef}
        lessonId={null}
        initialNodes={initialNodes}
        initialZones={initialZones}
        onNodesChange={onNodesChange}
        onZonesChange={onZonesChange}
        {...boardProps}
      />
    </div>
  )
})
export default EmbeddedCanvas
