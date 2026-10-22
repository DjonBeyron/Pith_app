import { useCallback, useEffect, useRef, useState } from 'react'

const EDGE = 120 // сколько пикселей окна всегда остаётся в области просмотра (чтобы его можно было схватить обратно)
const read = key => { try { const v = JSON.parse(localStorage.getItem(key) ?? 'null'); return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? v : null } catch { return null } }
const write = (key, pos) => { try { if (pos) localStorage.setItem(key, JSON.stringify(pos)); else localStorage.removeItem(key) } catch { /* нет хранилища */ } }

/** Положение окна в пределах области просмотра: наружу можно почти целиком, но край в EDGE px остаётся виден */
export const clampWindowPos = ({ x, y }, { w, h }, { vw, vh }) => ({ x: Math.min(Math.max(x, EDGE - w), vw - EDGE), y: Math.min(Math.max(y, 0), vh - Math.min(h, EDGE)) })

/**
 * Окно разбора можно таскать за шапку куда угодно (в том числе на второй монитор, если окно браузера растянуто на оба): положение
 * запоминается по ключу в localStorage, двойной клик по шапке возвращает окно в центр. Во время перетаскивания двигаем DOM напрямую
 * (без перерисовки окна на каждое движение мыши), в состояние пишем на отпускании
 */
export function useDragWindow(key) {
  const [pos, setPos] = useState(() => read(key))
  const boxRef = useRef(null)
  useEffect(() => { write(key, pos) }, [key, pos])
  const onHeadMouseDown = useCallback(e => {
    const box = boxRef.current
    if (e.button !== 0 || !box || e.target.closest('button, input, textarea, select, a, [contenteditable]')) return
    const r = box.getBoundingClientRect()
    const sx = e.clientX - r.left, sy = e.clientY - r.top
    let last = { x: r.left, y: r.top }
    const move = ev => {
      last = clampWindowPos({ x: ev.clientX - sx, y: ev.clientY - sy }, { w: r.width, h: r.height }, { vw: window.innerWidth, vh: window.innerHeight })
      box.style.position = 'fixed'; box.style.left = `${last.x}px`; box.style.top = `${last.y}px`; box.style.margin = '0'
    }
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); setPos(last) }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
    e.preventDefault()
  }, [])
  const reset = useCallback(() => { setPos(null); const b = boxRef.current; if (b) { b.style.position = ''; b.style.left = ''; b.style.top = ''; b.style.margin = '' } }, [])
  const style = pos ? { position: 'fixed', left: pos.x, top: pos.y, margin: 0 } : undefined
  return { boxRef, style, onHeadMouseDown, reset }
}
