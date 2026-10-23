import { useCallback, useEffect, useRef, useState } from 'react'

const EDGE = 120 // сколько пикселей окна всегда остаётся в области просмотра (чтобы его можно было схватить обратно)
const CORNER = 26 // зона «ручки ресайза» в правом нижнем углу
const SIZE_KEY = ':size2' // новый ключ: старые размеры (записанные ResizeObserver-ом без учёта отступов) были испорчены и сжимали окно
const read = key => { try { const v = JSON.parse(localStorage.getItem(key) ?? 'null'); return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? v : null } catch { return null } }
const readSize = key => { try { const v = JSON.parse(localStorage.getItem(key + SIZE_KEY) ?? 'null'); return v && v.w >= 300 && v.h >= 160 ? v : null } catch { return null } }
const write = (key, v) => { try { if (v) localStorage.setItem(key, JSON.stringify(v)); else localStorage.removeItem(key) } catch { /* нет хранилища */ } }

/** Положение окна в пределах области просмотра: наружу можно почти целиком, но край в EDGE px остаётся виден */
export const clampWindowPos = ({ x, y }, { w, h }, { vw, vh }) => ({ x: Math.min(Math.max(x, EDGE - w), vw - EDGE), y: Math.min(Math.max(y, 0), vh - Math.min(h, EDGE)) })

/** Попал ли нажатый пиксель в ручку ресайза (правый нижний угол рамки) */
export const inResizeCorner = (rect, x, y) => x >= rect.right - CORNER && y >= rect.bottom - CORNER && x <= rect.right && y <= rect.bottom

/**
 * Окно разбора таскается за шапку куда угодно в пределах вкладки (за пределы браузера — кнопка «⧉», usePopupWindow.js) и растягивается за правый
 * нижний угол (CSS resize): положение и размер запоминаются по ключу в localStorage, двойной клик по шапке — в центр и к размеру по умолчанию.
 * Перетаскивание двигает DOM напрямую (без перерисовки окна на каждое движение мыши). Размер читаем ТОЛЬКО по отпусканию мыши после нажатия
 * в углу (onBoxMouseDown), а не наблюдателем за размером: содержимое окна само меняет высоту, и такие изменения не должны стать «размером окна»
 */
export function useDragWindow(key) {
  const [pos, setPos] = useState(() => read(key))
  const [size, setSize] = useState(() => readSize(key))
  const boxRef = useRef(null)
  useEffect(() => { write(key, pos) }, [key, pos])
  useEffect(() => { write(key + SIZE_KEY, size) }, [key, size])
  const onHeadMouseDown = useCallback(e => {
    const box = boxRef.current
    if (e.button !== 0 || !box || e.target.closest('button, input, textarea, select, a, [contenteditable]')) return
    const r = box.getBoundingClientRect()
    const sx = e.clientX - r.left, sy = e.clientY - r.top
    let last = { x: r.left, y: r.top }
    const win = box.ownerDocument.defaultView
    const move = ev => {
      last = clampWindowPos({ x: ev.clientX - sx, y: ev.clientY - sy }, { w: r.width, h: r.height }, { vw: win.innerWidth, vh: win.innerHeight })
      box.style.position = 'fixed'; box.style.left = `${last.x}px`; box.style.top = `${last.y}px`; box.style.right = 'auto'; box.style.margin = '0'
    }
    const up = () => { win.removeEventListener('mousemove', move); win.removeEventListener('mouseup', up); setPos(last) }
    win.addEventListener('mousemove', move); win.addEventListener('mouseup', up)
    e.preventDefault()
  }, [])
  const onBoxMouseDown = useCallback(e => {
    const box = boxRef.current
    if (e.button !== 0 || !box || !inResizeCorner(box.getBoundingClientRect(), e.clientX, e.clientY)) return
    const win = box.ownerDocument.defaultView
    const up = () => { win.removeEventListener('mouseup', up); const r = box.getBoundingClientRect(); setSize({ w: Math.round(r.width), h: Math.round(r.height) }) }
    win.addEventListener('mouseup', up)
  }, [])
  const reset = useCallback(() => { setPos(null); setSize(null); const b = boxRef.current; if (b) b.style.cssText = '' }, [])
  const style = pos || size ? { ...(pos ? { position: 'fixed', left: pos.x, top: pos.y, right: 'auto', margin: 0 } : {}), ...(size ? { width: size.w, height: size.h, maxWidth: 'none', maxHeight: 'none' } : {}) } : undefined
  return { boxRef, style, onHeadMouseDown, onBoxMouseDown, reset }
}
