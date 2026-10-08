import { useId } from 'react'
import { confirmCopy } from './catchConfirm.js'

// Мини-табличка подтверждения «Ловли слов» — слой поверх шторки (рендерится внутри .catchSheet, высоту не меняет):
// прозрачный слой на всю шторку (без затемнения, тап по нему = отмена), непрозрачная карточка по центру.
// kind: 'reveal' | 'hint'; memory — слово своё (подсказка сдвинет повтор на завтра).
export default function CatchConfirmPopup({ kind, memory = false, onConfirm, onCancel }) {
  const titleId = useId()
  const { title, text, ok, cancel } = confirmCopy(kind, memory)
  return (
    <div className="catchConfirmLayer" onClick={onCancel}>
      <div className="catchConfirm" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={e => e.stopPropagation()}>
        <div className="catchConfirmTitle" id={titleId}>{title}</div>
        <p className="catchConfirmText">{text}</p>
        <div className="catchConfirmActions">
          <button type="button" className="catchConfirmCancel" onClick={onCancel}>{cancel}</button>
          <button type="button" className="catchConfirmOk" onClick={onConfirm}>{ok}</button>
        </div>
      </div>
    </div>
  )
}
