import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { NODE_TYPES } from '../canvas/nodeTypes.js'

// Кнопка «+ Добавить ноду выше/ниже» — вместо того чтобы молча создавать
// ноду прошлого выбранного типа, открывает компактное меню выбора типа
// (тот же список/стиль, что и NodeTypeSelect.jsx) прямо под кнопкой.
//
// branchChoices (опционально) — на ноде-развилке (верно/неверно) кнопка
// «ниже» иначе молча цепляла бы новую ноду только к «верно»: если задан,
// после выбора типа показывается второй шаг — к какому исходу присоединить
// новую ноду, onInsert(type, choiceValue) вызывается уже с обоими значениями.
export default function InsertNodeButton({ label, onInsert, className = 'productionInsertBtn', branchChoices }) {
  const [pos, setPos] = useState(null)
  const [pickedType, setPickedType] = useState(null)
  const btnRef = useRef(null)

  function openMenu(e) {
    e.stopPropagation()
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    setPos({ top: r.bottom + 3, left: r.left, width: Math.max(r.width, 200) })
    setPickedType(null)
  }

  function closeMenu() { setPos(null); setPickedType(null) }

  function pickType(type, e) {
    e.stopPropagation()
    if (branchChoices?.length) { setPickedType(type); return }
    closeMenu()
    onInsert(type)
  }

  function pickBranch(value, e) {
    e.stopPropagation()
    const type = pickedType
    closeMenu()
    onInsert(type, value)
  }

  return (
    <>
      <button ref={btnRef} className={className} onClick={openMenu}>{label}</button>
      {pos && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onMouseDown={e => { e.stopPropagation(); closeMenu() }} />
          <div
            className="nodeTypeSelectList"
            style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 9999 }}
            onMouseDown={e => e.stopPropagation()}
          >
            {pickedType ? (
              <>
                <div className="insertBranchHint">К какому ответу присоединить?</div>
                {branchChoices.map(c => (
                  <button
                    key={c.value}
                    className="nodeTypeSelectItem"
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => pickBranch(c.value, e)}
                  >
                    <span style={{ color: '#ccc' }}>{c.label}</span>
                  </button>
                ))}
              </>
            ) : (
              NODE_TYPES.map(t => {
                const Icon = t.icon
                return (
                  <button
                    key={t.value}
                    className="nodeTypeSelectItem"
                    style={{ background: `${t.color}26` }}
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => pickType(t.value, e)}
                  >
                    <Icon size={12} color={t.color} style={{ flexShrink: 0 }} />
                    <span style={{ color: '#ccc' }}>{t.label}</span>
                  </button>
                )
              })
            )}
          </div>
        </>,
        document.body
      )}
    </>
  )
}
