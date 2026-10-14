import { useState } from 'react'
import CopyIcon from './CopyIcon.jsx'
import { useDebouncedPatch } from './useDebouncedPatch.js'

/**
 * Поле редактора окна замечания: значение держит у себя (набор без лагов), в копию урока уходит с задержкой (useDebouncedPatch).
 * apply(newValue) → функция (data) => data для typeData[type]. rows > 0 — textarea, 0 — однострочное поле. ro — только чтение
 */
export default function EdField({ label, value, rows = 0, ro, reg, onPatch, apply, clean = v => v, cell = false }) {
  const [v, setV] = useState(value)
  const commit = useDebouncedPatch(onPatch, reg)
  const change = raw => { const nv = clean(raw); setV(nv); if (!ro) commit(apply(nv)) }
  const input = rows
    ? <textarea className="rvwEdIn" readOnly={ro} rows={rows} value={v} onChange={e => change(e.target.value)} />
    : <input className={cell ? undefined : 'rvwEdIn'} readOnly={ro} value={v} onChange={e => change(e.target.value)} />
  if (cell) return <>{input}<CopyIcon text={v} title="Скопировать ячейку" size={12} /></>
  return (
    <div className="rvwEdBlock">
      <label className="rvwEdLbl">{label} <CopyIcon text={v} /></label>
      {input}
    </div>
  )
}
