import { useState } from 'react'
import { nodeEditLabel } from '../player/admin/playerEditLabel.js'
import { isTaskNode } from './reviewCardCopy.js'

// «Подтянуть из урока»: список нод урока с галочками. Выбранные КОПИРУЮТСЯ в
// карточку (reviewCardCopy.copyNodesForCard) — урок при этом не меняется
export default function ReviewNodePicker({ nodes, onPick, onClose }) {
  const [picked, setPicked] = useState(() => new Set())
  const sorted = [...nodes].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))

  function toggle(id) {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="rcPickerBackdrop" onClick={onClose}>
      <div className="rcPicker" onClick={e => e.stopPropagation()}>
        <div className="rcPickerHead">Какие ноды урока скопировать в карточку?</div>
        <div className="rcPickerList">
          {sorted.length === 0 && <div className="rcPickerEmpty">В уроке пока нет нод</div>}
          {sorted.map(n => (
            <label key={n.id} className={isTaskNode(n) ? 'rcPickerRow rcPickerRowTask' : 'rcPickerRow'}>
              <input type="checkbox" checked={picked.has(n.id)} onChange={() => toggle(n.id)} />
              <span>{nodeEditLabel(n)}</span>
            </label>
          ))}
        </div>
        <div className="rcPickerFoot">
          <button className="pageTabBtn" onClick={onClose}>Отмена</button>
          <button
            className="productionPageSave"
            disabled={!picked.size}
            onClick={() => onPick([...picked])}
          >Скопировать ({picked.size})</button>
        </div>
      </div>
    </div>
  )
}
