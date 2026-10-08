import { useId } from 'react'
import { confirmCopy } from './catchConfirm.js'

// Мини-табличка подтверждения внутри шторки «Ловли слов» — над кнопками.
// kind: 'reveal' | 'hint'; memory — слово своё (подсказка сдвинет повтор на завтра).
export default function CatchConfirmPopup({ kind, memory = false, onConfirm, onCancel }) {
  const titleId = useId()
  const { title, text, ok, cancel } = confirmCopy(kind, memory)
  return (
    <div className="catchConfirm" role="dialog" aria-labelledby={titleId}>
      <div className="catchConfirmTitle" id={titleId}>{title}</div>
      <p className="catchConfirmText">{text}</p>
      <div className="catchConfirmActions">
        <button type="button" className="catchConfirmCancel" onClick={onCancel}>{cancel}</button>
        <button type="button" className="catchConfirmOk" onClick={onConfirm}>{ok}</button>
      </div>
    </div>
  )
}
