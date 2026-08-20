import { createPortal } from 'react-dom'
import { NODE_TYPES, isGroupStart } from './nodeTypes.js'

// Выпадающий список типов ноды — тот же, что в шапке ноды. Открывается там,
// где создаётся новая нода: по «+» в меню ноды и по клику на выходной кружок.
// pos — результат computeMenuPos (сам решает, вниз или вверх открывать).
//
// selected + multi — режим фильтра в шапке канваса: типы отмечаются галочками,
// меню при выборе не закрывается.
export default function NodeTypeMenu({ pos, onPick, onClose, selected, multi = false, onReset }) {
  if (!pos) return null
  return createPortal(
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
        onMouseDown={e => { e.stopPropagation(); onClose() }}
      />
      <div
        className="nodeTypeSelectList"
        style={{
          position: 'fixed',
          ...(pos.top != null ? { top: pos.top } : { bottom: pos.bottom }),
          left: pos.left,
          minWidth: pos.width,
          maxHeight: pos.maxHeight,
          overflowY: 'auto',
          zIndex: 9999,
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        {multi && onReset && (
          <button
            className="nodeTypeSelectReset"
            disabled={!selected?.size}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onReset() }}
          >Сбросить фильтры</button>
        )}
        {NODE_TYPES.map((t, i) => {
          const Icon = t.icon
          return (
            <button
              key={t.value}
              className={'nodeTypeSelectItem' + (isGroupStart(i) ? ' nodeTypeSelectItemGroupStart' : '')}
              style={{ background: `${t.color}26` }}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation()
                if (!multi) onClose()
                onPick(t.value)
              }}
            >
              <Icon size={12} color={t.color} style={{ flexShrink: 0 }} />
              <span style={{ color: '#ccc', flex: 1 }}>{t.label}</span>
              {multi && (
                <span style={{ color: selected?.has(t.value) ? '#b6fe3b' : '#3a3f4a', fontSize: 11 }}>
                  {selected?.has(t.value) ? '✓' : '○'}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </>,
    document.body,
  )
}
