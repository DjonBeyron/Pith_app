import NodeTypeMenu from './NodeTypeMenu.jsx'
import CanvasZoomBadge from './CanvasZoomBadge.jsx'
import CanvasSelectionToolbar from './CanvasSelectionToolbar.jsx'

// Элементы интерфейса поверх доски канваса, не привязанные к нодам: значок
// зума, панель группового выделения, меню выбора типа новой ноды, рамка
// выделения и кнопка «+ Нода». Вынесено из CanvasBoard.jsx (тот упирался в
// потолок 400 строк); вся логика — в хуках доски, сюда приходят готовые
// значения и колбэки
export default function CanvasBoardChrome({
  scale, onResetZoom, selection, typeMenu, setTypeMenu,
  insertFromPort, insertSignalFromPort, insertAfterNode, marquee, onAddNode,
}) {
  return (
    <>
      <CanvasZoomBadge scale={scale} onReset={onResetZoom} />

      <CanvasSelectionToolbar
        count={selection.count}
        confirming={selection.confirming}
        onAskDelete={selection.onAskDelete}
        onDelete={selection.onDelete}
        onCancel={selection.onCancel}
      />

      <NodeTypeMenu
        pos={typeMenu?.pos}
        onClose={() => setTypeMenu(null)}
        onPick={type => {
          if (!typeMenu) return
          if (typeMenu.triggerIdx != null) insertFromPort(typeMenu.nodeId, typeMenu.triggerIdx, type)
          else if (typeMenu.slotIndex != null) insertSignalFromPort(typeMenu.nodeId, typeMenu.slotIndex, type)
          else insertAfterNode(typeMenu.nodeId, type)
          setTypeMenu(null)
        }}
      />

      {marquee && (
        <div
          className="canvasMarquee"
          style={{
            left: Math.min(marquee.x0, marquee.x1),
            top: Math.min(marquee.y0, marquee.y1),
            width: Math.abs(marquee.x1 - marquee.x0),
            height: Math.abs(marquee.y1 - marquee.y0),
          }}
        />
      )}

      <button className="canvasAddBtn" onClick={onAddNode}>+ Нода</button>
    </>
  )
}
