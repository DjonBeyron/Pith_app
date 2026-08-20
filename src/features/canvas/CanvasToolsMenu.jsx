import { createPortal } from 'react-dom'

// Меню редких действий шапки канваса («⋯»): вернуть данные с сервера,
// очистить, прокрутить к началу, раздвинуть ноды. В строке шапки их держать
// незачем — там и без того тесно, а нужны они изредка.
export default function CanvasToolsMenu({ pos, items, onClose }) {
  if (!pos) return null
  return createPortal(
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
        onMouseDown={e => { e.stopPropagation(); onClose() }}
      />
      <div
        className="canvasToolsMenu"
        style={{
          position: 'fixed',
          ...(pos.top != null ? { top: pos.top } : { bottom: pos.bottom }),
          left: pos.left,
          maxHeight: pos.maxHeight,
          zIndex: 9999,
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        {items.map(item => (
          <button
            key={item.label}
            className={`canvasToolsItem${item.danger ? ' canvasToolsItemDanger' : ''}`}
            disabled={item.disabled}
            title={item.title}
            onClick={e => { e.stopPropagation(); onClose(); item.onClick() }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>,
    document.body,
  )
}
