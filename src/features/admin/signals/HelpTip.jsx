import { useState, useRef, useEffect, useLayoutEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import { CircleHelp } from 'lucide-react'
import { helpFor } from './helpTexts.js'
import { popoverPosition } from './popoverPosition.js'
import { registerOpenHelp, unregisterOpenHelp, closeOpenHelp } from './helpOpenState.js'
import '../../../styles/admin-signals-help.css'

// Кнопка «?» с пояснением простыми словами. Открывается кликом/тапом и с клавиатуры
// (Enter/Space), закрывается повторным нажатием, Esc или кликом вне. Одновременно
// открыта одна подсказка. Подсказка — в портале внутри .fsWin (там токены темы окна),
// позиция fixed, считается popoverPosition.js (не вылезает за экран).
// Клики по кнопке и по самой подсказке не всплывают к родителям (строка сигнала, тумблер,
// сортировка) — React-события через портал идут по дереву компонентов, поэтому
// stopPropagation стоит и на подсказке. Подсказка не закрывается нажатием на неё и никогда
// не получает pointer-events:none — клик не «проваливается» на то, что под ней.
// Esc окна закрывает сперва подсказку (helpOpenState.js). Вход: help — ключ из helpTexts.js, либо content — готовый { title, body, example? }.
export default function HelpTip({ help, content }) {
  const data = content ?? helpFor(help)
  const [open, setOpen] = useState(false)
  const [host, setHost] = useState(null)
  const btnRef = useRef(null)
  const popRef = useRef(null)
  const id = useId()

  // Единственная открытая подсказка + закрытие по клику вне
  useEffect(() => {
    if (!open) return undefined
    const close = refocus => { setOpen(false); if (refocus) btnRef.current?.focus() }
    registerOpenHelp(close)
    const onDocClick = e => {
      if (btnRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return
      close(false)
    }
    document.addEventListener('click', onDocClick, true)
    return () => {
      document.removeEventListener('click', onDocClick, true)
      unregisterOpenHelp(close)
    }
  }, [open])

  // Позиция: считаем до отрисовки, пишем прямо в стиль (без лишнего рендера); следим за прокруткой/ресайзом
  useLayoutEffect(() => {
    if (!open) return undefined
    const place = () => {
      const pop = popRef.current, btn = btnRef.current
      if (!pop || !btn) return
      pop.style.maxHeight = ''
      const p = popoverPosition(btn.getBoundingClientRect(), { w: pop.offsetWidth, h: pop.scrollHeight + 2 }, { w: window.innerWidth, h: window.innerHeight })
      pop.style.left = `${p.left}px`
      pop.style.top = `${p.top}px`
      pop.style.maxHeight = `${p.maxHeight}px`
      pop.dataset.placement = p.placement
    }
    place()
    const onScroll = e => { if (!popRef.current?.contains(e.target)) place() }
    window.addEventListener('resize', place)
    window.addEventListener('scroll', onScroll, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', onScroll, true) }
  }, [open, host])

  if (!data) return null

  const toggle = e => {
    e.stopPropagation()
    if (open) { setOpen(false); return }
    closeOpenHelp()
    setHost(btnRef.current?.closest('.fsWin') ?? document.body)
    setOpen(true)
  }
  const onKeyDown = e => {
    e.stopPropagation()
    if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(false) }
  }
  const stop = e => e.stopPropagation()

  return (
    <>
      <button
        ref={btnRef} type="button" className="htBtn" onClick={toggle} onKeyDown={onKeyDown} onPointerDown={stop}
        aria-label={`Что это? ${data.title}`} aria-expanded={open} aria-describedby={open ? id : undefined}
      >
        <CircleHelp size={15} aria-hidden="true" />
      </button>
      {open && host && createPortal(
        <div ref={popRef} id={id} role="tooltip" className="htPop" onClick={stop} onPointerDown={stop} onKeyDown={stop}>
          <p className="htTitle">{data.title}</p>
          <p className="htBody">{data.body}</p>
          {data.example && <p className="htExample"><b>Пример.</b> {data.example}</p>}
        </div>,
        host,
      )}
    </>
  )
}
