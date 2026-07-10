import { useState, useRef, useEffect } from 'react'

// Кастомный выпадающий список конструктора гонки: ограниченная высота со
// скроллом (нативный select на длинных списках неудобен, особенно на телефоне).
// options: [{ id, label, hint? }]
export default function AdminRacePicker({ value = null, placeholder = 'Выбрать...', options, onPick }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  // Тап вне списка — закрыть
  useEffect(() => {
    if (!open) return
    const h = e => { if (!wrapRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', h)
    return () => document.removeEventListener('pointerdown', h)
  }, [open])

  const current = options.find(o => o.id === value)

  return (
    <div className="arpWrap" ref={wrapRef}>
      <button type="button" className="arpBtn" onClick={() => setOpen(o => !o)}>
        <span className="arpBtnLabel">{current ? current.label : placeholder}</span>
        <span className="arpBtnCaret">▾</span>
      </button>
      {open && (
        <div className="arpList">
          {options.map(o => (
            <button
              type="button"
              key={o.id}
              className={o.id === value ? 'arpItem arpItemActive' : 'arpItem'}
              onClick={() => { onPick(o.id); setOpen(false) }}
            >
              <span className="arpItemLabel">{o.label}</span>
              {o.hint && <span className="arpItemHint">{o.hint}</span>}
            </button>
          ))}
          {options.length === 0 && <div className="arpEmpty">Список пуст</div>}
        </div>
      )}
    </div>
  )
}
