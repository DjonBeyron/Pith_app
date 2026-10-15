import { useState, useRef, useEffect, useId } from 'react'
import { ChevronDown } from 'lucide-react'
import { sceneUseOptions, USE_IN_LESSON_HINT } from './sceneUseOptions.js'
import ScTip from '../ScTip.jsx'

// Кнопка «Использовать» в строке сцены «Моих сцен». В режимах node/module — одно прямое
// действие (подпись из sceneUseOptions). В админке — выпадающее меню (role="menu") с пунктами
// и подсказкой, как взять сцену в уроке. Своё меню, не confirm(): Esc закрывает его (и помечено
// data-esc-own — окно сборщика этот Esc не трогает), клик вне закрывает, ↑/↓ ходят по пунктам.
export default function UseSceneMenu({ row, mode, onAction, disabled = false }) {
  const { direct, items } = sceneUseOptions(mode, row)
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const btnRef = useRef(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return undefined
    const onDoc = e => { if (!rootRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', onDoc, true)
    rootRef.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus()
    return () => document.removeEventListener('pointerdown', onDoc, true)
  }, [open])

  const close = refocus => { setOpen(false); if (refocus) btnRef.current?.focus() }
  const act = id => { close(true); onAction(id, row) }
  const onKey = e => {
    if (!open) return
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const list = [...(rootRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') ?? [])]
      const i = list.indexOf(document.activeElement)
      list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length]?.focus()
    }
  }

  if (direct) {
    const it = items[0]
    return (
      <span className="scbUse">
        <button type="button" className="fsBtn fsBtnSmall fsBtnPrimary" onClick={() => onAction(it.id, row)} disabled={disabled} title={it.hint}>Использовать</button>
        <ScTip help="use_scene" />
      </span>
    )
  }
  return (
    <span ref={rootRef} className={`scbUse${open ? ' scbMenuOpen' : ''}`} data-esc-own={open ? '1' : undefined} onKeyDown={onKey} onClick={e => e.stopPropagation()}>
      <button ref={btnRef} type="button" className="fsBtn fsBtnSmall fsBtnPrimary scbUseBtn" onClick={() => setOpen(o => !o)} disabled={disabled} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}>
        Использовать <ChevronDown size={13} aria-hidden="true" />
      </button>
      <ScTip help="use_scene" />
      {open && (
        <div id={menuId} role="menu" className="scbMenu" aria-label={`Использовать сцену «${row.title}»`}>
          {items.map(it => (
            <button key={it.id} type="button" role="menuitem" className="scbMenuItem" disabled={it.disabled} onClick={() => act(it.id)} title={it.disabled ? it.reason : it.hint}>
              <span className="scbMenuLabel">{it.label}</span>
              <span className="scbMenuHint">{it.disabled ? it.reason : it.hint}</span>
            </button>
          ))}
          <p className="scbMenuFoot">{USE_IN_LESSON_HINT}</p>
        </div>
      )}
    </span>
  )
}
