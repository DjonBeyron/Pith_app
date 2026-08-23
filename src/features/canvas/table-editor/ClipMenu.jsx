import { createPortal } from 'react-dom'

// Меню клипа на дорожке — одна кнопка ▾ вместо россыпи иконок.
// Что можно сделать со слоем: пустить его значение в сборку фразы или нет,
// повторить ту же анимацию ещё раз и поставить момент очистки собранного.
export default function ClipMenu({ rect, collect, canCollect, onToggleCollect, onDuplicate, onClear, onClose }) {
  if (!rect) return null

  const width = 210
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8)
  const openUp = rect.bottom > window.innerHeight - 160
  const pos = openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }

  const pick = fn => { fn(); onClose() }

  return createPortal(
    <>
      <div className="clipMenuOverlay" onMouseDown={onClose} />
      <div className="clipMenu" style={{ left, width, ...pos }} onMouseDown={e => e.stopPropagation()}>
        {canCollect && (
          <button className="clipMenuItem" onClick={() => pick(onToggleCollect)}>
            <span className={`clipMenuMark${collect ? ' clipMenuMarkOn' : ''}`}>{collect ? '✓' : ''}</span>
            Идёт в сборку фразы
          </button>
        )}
        <button className="clipMenuItem" onClick={() => pick(onDuplicate)}>
          <span className="clipMenuIcon">⧉</span>
          Дублировать клип
        </button>
        <button className="clipMenuItem" onClick={() => pick(onClear)}>
          <span className="clipMenuIcon">⌫</span>
          Очистить собранное
        </button>
      </div>
    </>,
    document.body,
  )
}
