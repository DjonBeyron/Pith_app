import { useState, useRef, useEffect, useId } from 'react'
import { Ellipsis, ChevronDown, Check } from 'lucide-react'
import { menuKeyAction } from './menuKeys.js'

// Меню тулбара. Два применения: «⋯» на узком окне (по умолчанию — сюда складываются действия, не
// поместившиеся на панель, toolbarModel.splitByWidth → menuItems) и кнопка с выпадашкой (text —
// «Озвучить ▾»: mainRun — клик по основной части, стрелка открывает пункты всё / только текст /
// только перевод). Доступно с клавиатуры: Enter/Space/↓ на кнопке открывают и фокусируют первый пункт,
// ↑/↓/Home/End ходят по пунктам, Esc закрывает и возвращает фокус (пока открыто — data-esc-own: Esc
// окна его не трогает), Tab закрывает, клик вне — тоже. Пункт с heading открывает блок группы (role=group, подпись, линия). Пункт: { id, label, hint?, run, disabled?,
// role? ('menuitemradio' | 'menuitemcheckbox'), checked? }. Без пунктов не рендерится. initialOpen — тесты/снимки.
// Пункты → блоки по подписям групп (item.heading открывает новый блок: заголовок + разделитель над ним)
function chunks(items) {
  const out = []
  for (const it of items) {
    if (it.heading || !out.length) out.push({ heading: it.heading ?? null, items: [] })
    out.at(-1).items.push(it)
  }
  return out
}

export default function ToolbarOverflowMenu({ items, initialOpen = false, text = null, Icon = null, label = 'Ещё действия', hint = 'Ещё: сохранить как, публикация, тема, служебное', menuLabel = 'Действия окна', disabled = false, mainRun = null, actionId = null }) {
  const [open, setOpen] = useState(initialOpen)
  const rootRef = useRef(null)
  const btnRef = useRef(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return undefined
    const onDoc = e => { if (!rootRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', onDoc, true)
    if (!initialOpen) rootRef.current?.querySelector('[role^="menuitem"]:not(:disabled)')?.focus()
    return () => document.removeEventListener('pointerdown', onDoc, true)
  }, [open, initialOpen])

  if (!items.length) return null
  const close = refocus => { setOpen(false); if (refocus) btnRef.current?.focus() }
  const pick = it => { close(true); it.run() }
  const move = to => {
    const list = [...(rootRef.current?.querySelectorAll('[role^="menuitem"]:not(:disabled)') ?? [])]
    if (!list.length) return
    const i = list.indexOf(document.activeElement)
    const next = to === 'first' ? 0 : to === 'last' ? list.length - 1 : (i + to + list.length) % list.length
    list[next]?.focus()
  }
  const onKey = e => {
    const act = menuKeyAction(e.key, open)
    if (!act) return
    if (act === 'tab') { setOpen(false); return }
    e.preventDefault()
    if (act === 'open') setOpen(true)
    else if (act === 'close') { e.stopPropagation(); close(true) }
    else move(act === 'next' ? 1 : act === 'prev' ? -1 : act)
  }
  const split = !!text && !!mainRun

  return (
    <span ref={rootRef} className={`scbTbMenu${open ? ' scbMenuOpen' : ''}${split ? ' scbTbSplit' : ''}`} data-esc-own={open ? '1' : undefined} onKeyDown={onKey}>
      {split && (
        <button type="button" className="fsBtn scbTbSplitMain" data-action={actionId ?? undefined} onClick={mainRun} disabled={disabled} title={hint || label}>
          {Icon && <Icon size={13} aria-hidden="true" />}{text}
        </button>
      )}
      <button
        ref={btnRef} type="button" className={split ? 'fsBtn scbTbSplitArrow' : 'scbTbIcon'} onClick={() => setOpen(o => !o)} disabled={split ? false : disabled}
        aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} aria-label={split ? `${label}: варианты` : label} title={split ? `${label}: всё / только текст / только перевод` : (hint || label)}
      >
        {split ? <ChevronDown size={14} aria-hidden="true" /> : <Ellipsis size={18} aria-hidden="true" />}
      </button>
      {open && (
        <div id={menuId} role="menu" className="scbMenu scbTbMenuList" aria-label={menuLabel}>
          {chunks(items).map((ch, i) => {
            const rows = ch.items.map(it => (
              <button key={it.id} type="button" role={it.role ?? 'menuitem'} aria-checked={it.role ? !!it.checked : undefined} className={`scbMenuItem${it.checked ? ' scbMenuItemOn' : ''}`} disabled={it.disabled} onClick={() => pick(it)} title={it.hint}>
                {it.role && <span className="scbMenuCheck" aria-hidden="true">{it.checked ? <Check size={13} /> : null}</span>}
                <span className="scbMenuLabel">{it.label}</span>
                {it.hint && <span className="scbMenuHint">{it.hint}</span>}
              </button>
            ))
            if (!ch.heading) return rows
            return (
              <div key={ch.heading} role="group" aria-label={ch.heading} className={`scbMenuGroup${i > 0 ? ' scbMenuGroupSep' : ''}`}>
                <div className="scbMenuHead" aria-hidden="true">{ch.heading}</div>
                {rows}
              </div>
            )
          })}
        </div>
      )}
    </span>
  )
}
