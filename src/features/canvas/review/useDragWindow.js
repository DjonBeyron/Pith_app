import { useCallback, useEffect, useRef, useState } from 'react'

const EDGE = 120 // сколько пикселей окна всегда остаётся в области просмотра (чтобы его можно было схватить обратно)
const read = key => { try { const v = JSON.parse(localStorage.getItem(key) ?? 'null'); return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? v : null } catch { return null } }
const readSize = key => { try { const v = JSON.parse(localStorage.getItem(`${key}:size`) ?? 'null'); return v && v.w > 200 && v.h > 120 ? v : null } catch { return null } }
const write = (key, v) => { try { if (v) localStorage.setItem(key, JSON.stringify(v)); else localStorage.removeItem(key) } catch { /* нет хранилища */ } }

/** Положение окна в пределах области просмотра: наружу можно почти целиком, но край в EDGE px остаётся виден */
export const clampWindowPos = ({ x, y }, { w, h }, { vw, vh }) => ({ x: Math.min(Math.max(x, EDGE - w), vw - EDGE), y: Math.min(Math.max(y, 0), vh - Math.min(h, EDGE)) })

/**
 * Окно разбора таскается за шапку куда угодно в пределах вкладки (за пределы браузера — кнопка «⧉ в отдельное окно», usePopupWindow.js) и
 * растягивается за правый нижний угол (CSS resize): положение и размер запоминаются по ключу в localStorage, двойной клик по шапке — в центр
 * и к размеру по умолчанию. Во время перетаскивания двигаем DOM напрямую (без перерисовки окна на каждое движение мыши), размер читаем
 * ResizeObserver-ом с задержкой — React в самом ресайзе не участвует, перерисовки нет
 */
export function useDragWindow(key) {
  const [pos, setPos] = useState(() => read(key))
  const [size, setSize] = useState(() => readSize(key))
  const boxRef = useRef(null)
  useEffect(() => { write(key, pos) }, [key, pos])
  useEffect(() => { write(`${key}:size`, size) }, [key, size])
  useEffect(() => {
    const box = boxRef.current
    if (!box || typeof ResizeObserver === 'undefined') return undefined
    let t = null, first = true
    const ro = new ResizeObserver(([e]) => {
      if (first) { first = false; return } // первое срабатывание — сам монтаж, не ресайз руками
      clearTimeout(t)
      t = setTimeout(() => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }), 300)
    })
    ro.observe(box)
    return () => { ro.disconnect(); clearTimeout(t) }
  }, [])
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
  const reset = useCallback(() => { setPos(null); setSize(null); const b = boxRef.current; if (b) { b.style.cssText = '' } }, [])
  const style = pos || size ? { ...(pos ? { position: 'fixed', left: pos.x, top: pos.y, margin: 0 } : {}), ...(size ? { width: size.w, height: size.h, maxWidth: 'none', maxHeight: 'none' } : {}) } : undefined
  return { boxRef, style, onHeadMouseDown, reset }
}
