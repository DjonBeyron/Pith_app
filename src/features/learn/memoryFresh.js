import { useEffect, useState } from 'react'

// Новое слово во временной памяти (итог урока-слова, SummaryMemoryCard):
// по «Закрыть» слово улетает к вкладке «Память», и на ней горит точка, пока
// вкладку не откроют (PROJECT.md → «Вкладки»). Флаг — в localStorage: точка
// переживает перезагрузку. Кнопка вкладки на нижней панели — [data-nav="learn"]
const KEY = 'pithy_memory_fresh_v1'
const EVENT = 'pithy:memory-fresh'

const isFresh = () => { try { return !!localStorage.getItem(KEY) } catch { return false } }

// Слово — во вкладку: полёт копии плашки el к кнопке вкладки + точка на ней
export function sendWordToMemory(el) {
  try { localStorage.setItem(KEY, '1') } catch { /* приватный режим — точка до перезагрузки */ }
  window.dispatchEvent(new Event(EVENT))
  flyToTab(el)
}

function flyToTab(el) {
  const target = document.querySelector('[data-nav="learn"]')
  if (!el || !target || !el.animate) return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const a = el.getBoundingClientRect()
  const b = target.getBoundingClientRect()
  const clone = el.cloneNode(true)
  Object.assign(clone.style, {
    position: 'fixed', left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`,
    margin: '0', zIndex: '100000', pointerEvents: 'none',
  })
  document.body.appendChild(clone)
  const dx = b.left + b.width / 2 - (a.left + a.width / 2)
  const dy = b.top + b.height / 2 - (a.top + a.height / 2)
  clone.animate(
    [{ transform: 'translate(0, 0) scale(1)', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(0.35)`, opacity: 0.2 }],
    { duration: 700, easing: 'cubic-bezier(0.5, 0, 0.75, 0)' },
  ).finished.finally(() => clone.remove())
}

// Точка «новое слово» на вкладке: горит, пока вкладку не открыли (open)
export function useMemoryFresh(open) {
  const [fresh, setFresh] = useState(isFresh)
  useEffect(() => {
    const on = () => setFresh(true)
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  useEffect(() => {
    if (!open || !fresh) return
    try { localStorage.removeItem(KEY) } catch { /* нечего чистить */ }
    setFresh(false) // eslint-disable-line react-hooks/set-state-in-effect -- вкладку открыли: гасим точку
  }, [open, fresh])
  return fresh
}
