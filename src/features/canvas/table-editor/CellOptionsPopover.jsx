import { useState } from 'react'

// Особые значения ячейки: список вариантов, по одному в строке. В уроке из
// такой ячейки выпадает меню выбора (ручной режим), а в авто-режиме нужный
// вариант заранее выбирает автор — на её дорожке в таймлайне.
export default function CellOptionsPopover({ cell, onSave, onClose }) {
  const [text, setText] = useState(() => (cell.options ?? []).join('\n'))

  function save() {
    onSave(text.split('\n').map(s => s.trim()).filter(Boolean))
    onClose()
  }

  return (
    <>
      <div className="cellOptsOverlay" onMouseDown={onClose} />
      <div className="cellOptsPopover" onMouseDown={e => e.stopPropagation()}>
        <div className="cellOptsHead">
          Варианты ячейки «{cell.value?.trim() || '…'}»
        </div>
        <textarea
          className="cellOptsInput"
          value={text}
          autoFocus
          placeholder={'he\nshe\nit'}
          onChange={e => setText(e.target.value)}
        />
        <div className="cellOptsHint">
          По одному варианту в строке. Пусто — обычная ячейка без меню.
        </div>
        <div className="cellOptsActions">
          <button className="cellOptsGhost" onClick={onClose}>Отмена</button>
          <button className="cellOptsPrimary" onClick={save}>Готово</button>
        </div>
      </div>
    </>
  )
}
