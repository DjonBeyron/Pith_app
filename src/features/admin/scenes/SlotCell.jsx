import { useState, useRef, useEffect, useId } from 'react'
import { ChevronDown } from 'lucide-react'
import SpritePreview from './SpritePreview.jsx'
import { LAYER_LABEL } from './slotRules.js'

// Одна ячейка слота: кнопка с мини-превью текущего предмета и выпадающий список
// совместимых предметов (с превью, первым пунктом — «пусто»). Свой список, а не <select>:
// в нативном нельзя показать картинку. Клавиатура: Enter/Space/↓ открывает, ↑/↓ ходит по
// пунктам, Enter выбирает, Esc закрывает (и помечает событие, чтобы окно сборщика не
// закрылось). Клики внутри не всплывают к родителям; клик вне — закрывает.
// state — slotState() из slotRules.js: { slot, value, enabled, reason, options, sprite }.
export default function SlotCell({ state, onPick }) {
  const { slot, value, enabled, reason, options, sprite } = state
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const listRef = useRef(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return undefined
    const onDoc = e => { if (!rootRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', onDoc, true)
    listRef.current?.querySelector('[aria-selected="true"]')?.focus()
    return () => document.removeEventListener('pointerdown', onDoc, true)
  }, [open])

  const pick = id => { onPick(slot.id, id); setOpen(false); rootRef.current?.querySelector('.scbSlotBtn')?.focus() }
  const stop = e => e.stopPropagation()
  const onKey = e => {
    if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); rootRef.current?.querySelector('.scbSlotBtn')?.focus(); return }
    if (!open) { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true) } return }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const items = [...(listRef.current?.querySelectorAll('[role="option"]') ?? [])]
      const i = items.indexOf(document.activeElement)
      const next = items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]
      next?.focus()
    }
  }

  return (
    <div ref={rootRef} className={`scbSlot${open ? ' scbSlotOpen' : ''}${!enabled ? ' scbSlotOff' : ''}`} onClick={stop} onKeyDown={onKey}>
      <div className="scbSlotHead">
        <span className="scbSlotTitle">{slot.title}</span>
        <span className="scbSlotMeta"><code>{slot.id}</code> · {LAYER_LABEL[slot.layer]}</span>
      </div>
      <button
        type="button" id={`f-slots-${slot.id}`} className="scbSlotBtn" disabled={!enabled}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
        title={!enabled ? reason : `Выбрать предмет для слота «${slot.title}»`}
        onClick={e => { e.stopPropagation(); if (enabled) setOpen(o => !o) }}
      >
        <span className="scbSlotArt">{sprite ? <SpritePreview sprite={sprite} size={30} /> : <span className="scbSlotEmpty" aria-hidden="true">∅</span>}</span>
        <span className="scbSlotVal">{sprite ? sprite.title : 'пусто'}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {!enabled && <p className="scbSlotReason">{reason}</p>}
      {open && (
        <ul ref={listRef} id={listId} className="scbSlotList" role="listbox" aria-label={`Предмет для слота «${slot.title}»`}>
          <li>
            <button type="button" role="option" aria-selected={!value} className="scbOpt" onClick={() => pick(null)}>
              <span className="scbSlotArt"><span className="scbSlotEmpty" aria-hidden="true">∅</span></span><span>пусто</span>
            </button>
          </li>
          {options.map(s => (
            <li key={s.id}>
              <button type="button" role="option" aria-selected={value === s.id} className="scbOpt" onClick={() => pick(s.id)}>
                <span className="scbSlotArt"><SpritePreview sprite={s} size={30} /></span>
                <span>{s.title} <small>{s.nodeCount} уз.</small></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
