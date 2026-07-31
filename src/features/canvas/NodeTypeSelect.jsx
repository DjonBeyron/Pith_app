import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { NODE_TYPES } from './nodeTypes.js'
import { computeMenuPos } from '../../shared/lib/menuPosition.js'

export default function NodeTypeSelect({ value, onChange, compact = false }) {
  const [pos, setPos] = useState(null)
  const triggerRef = useRef(null)
  const current = NODE_TYPES.find(t => t.value === value) ?? NODE_TYPES[0]
  const Icon = current.icon

  function openList(e) {
    e.stopPropagation()
    const r = triggerRef.current?.getBoundingClientRect()
    if (!r) return
    // Триггер внизу экрана — список открывается вверх, а не за нижний край
    setPos(computeMenuPos(r))
  }

  function closeList() { setPos(null) }

  function pick(val, e) {
    e.stopPropagation()
    closeList()
    if (val !== value) onChange(val)
  }

  return (
    <div
      className={compact ? 'nodeTypeSelect nodeTypeSelectCompact' : 'nodeTypeSelect'}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <button
        ref={triggerRef}
        className="nodeTypeSelectTrigger"
        // Обводка — приглушённая (смешана с тёмным фоном, как colorBg в
        // CanvasNode.jsx), иначе чистый цвет типа на 1px рамке слепит;
        // текст/иконка остаются полным цветом — по ним тип и различаем
        style={{ borderColor: `color-mix(in srgb, ${current.color} 40%, #0a0c10)`, color: current.color }}
        onClick={openList}
      >
        <Icon size={compact ? 10 : 12} />
        <span className="nodeTypeSelectLabel">{current.label}</span>
        <span className="nodeTypeSelectArrow" style={{ opacity: 0.5 }}>▾</span>
      </button>

      {pos && createPortal(
        <>
          {/* backdrop escapes any CSS transform on canvas ancestors */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            onMouseDown={e => { e.stopPropagation(); closeList() }}
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
            {NODE_TYPES.map(t => {
              const TIcon = t.icon
              const active = t.value === value
              return (
                <button
                  key={t.value}
                  className={'nodeTypeSelectItem' + (active ? ' nodeTypeSelectItemActive' : '')}
                  style={{ background: `${t.color}26` }}
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => pick(t.value, e)}
                >
                  <TIcon size={12} color={t.color} style={{ flexShrink: 0 }} />
                  <span style={{ color: active ? '#fff' : '#ccc' }}>{t.label}</span>
                </button>
              )
            })}
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
