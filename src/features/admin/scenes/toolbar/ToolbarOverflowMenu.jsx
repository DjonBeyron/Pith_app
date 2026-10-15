import { useState, useRef, useEffect, useId } from 'react'
import { Ellipsis } from 'lucide-react'

// Меню «⋯» тулбара на узком окне: сюда складываются действия, не поместившиеся на панель
// (toolbarModel.splitByWidth). Доступно с клавиатуры: Enter/Space/↓ на кнопке открывают и
// фокусируют первый пункт, ↑/↓/Home/End ходят по пунктам, Esc закрывает и возвращает фокус на
// «⋯» (пока открыто — data-esc-own: Esc окна его не трогает), Tab закрывает, клик вне — тоже.
// Пункт: { id, label, hint?, run, disabled? }. Без пунктов не рендерится. initialOpen — тесты/снимки.
export default function ToolbarOverflowMenu({ items, initialOpen = false }) {
  const [open, setOpen] = useState(initialOpen)
  const rootRef = useRef(null)
  const btnRef = useRef(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return undefined
    const onDoc = e => { if (!rootRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', onDoc, true)
    if (!initialOpen) rootRef.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus()
    return () => document.removeEventListener('pointerdown', onDoc, true)
  }, [open, initialOpen])

  if (!items.length) return null
  const close = refocus => { setOpen(false); if (refocus) btnRef.current?.focus() }
  const pick = it => { close(true); it.run() }
  const move = to => {
    const list = [...(rootRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') ?? [])]
    if (!list.length) return
    const i = list.indexOf(document.activeElement)
    const next = to === 'first' ? 0 : to === 'last' ? list.length - 1 : (i + to + list.length) % list.length
    list[next]?.focus()
  }
  const onKey = e => {
    if (!open) { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true) } return }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    else if (e.key === 'Home') { e.preventDefault(); move('first') }
    else if (e.key === 'End') { e.preventDefault(); move('last') }
    else if (e.key === 'Tab') setOpen(false)
  }

  return (
    <span ref={rootRef} className={`scbTbMenu${open ? ' scbMenuOpen' : ''}`} data-esc-own={open ? '1' : undefined} onKeyDown={onKey}>
      <button ref={btnRef} type="button" className="scbTbIcon" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} aria-label="Ещё действия" title="Ещё действия">
        <Ellipsis size={18} aria-hidden="true" />
      </button>
      {open && (
        <div id={menuId} role="menu" className="scbMenu scbTbMenuList" aria-label="Действия окна">
          {items.map(it => (
            <button key={it.id} type="button" role="menuitem" className="scbMenuItem" disabled={it.disabled} onClick={() => pick(it)} title={it.hint}>
              <span className="scbMenuLabel">{it.label}</span>
              {it.hint && <span className="scbMenuHint">{it.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}
