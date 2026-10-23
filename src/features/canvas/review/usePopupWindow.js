import { useEffect, useRef, useState } from 'react'

/** Стили текущей страницы (ссылки и инлайн-стили Vite) — во второе окно, чтобы оно выглядело так же */
function copyStyles(from, to) {
  to.head.appendChild(Object.assign(to.createElement('meta'), { charset: 'utf-8' }))
  for (const node of from.querySelectorAll('link[rel="stylesheet"], style')) to.head.appendChild(node.cloneNode(true))
}

/**
 * Отдельное окно браузера для окна замечания («⧉ в отдельное окно»): его можно утащить на второй монитор. Пока open — открыто окно
 * (popup) с теми же стилями, body — контейнер для createPortal. Закрыл окно крестиком ОС → onClosed (правки остаются, как «Сохранить правку»).
 * Ограничение: в отдельном окне поля ввода работают (события React идут через портал), но всплывающие панели, которые рисуются в
 * document.body ГЛАВНОГО окна, там не видны — для раскраски текста есть кнопка «снять раскраску» и обычное окно
 */
export function usePopupWindow(open, { title = 'Замечание', width = 1280, height = 860, onClosed } = {}) {
  const [body, setBody] = useState(null)
  const winRef = useRef(null)
  const onClosedRef = useRef(onClosed)
  useEffect(() => { onClosedRef.current = onClosed })
  useEffect(() => {
    if (!open) return undefined
    const win = window.open('', '_blank', `popup=yes,width=${width},height=${height}`)
    if (!win) return undefined
    winRef.current = win
    const doc = win.document
    doc.title = title
    copyStyles(document, doc)
    doc.body.className = 'rvwPopupBody'
    const onGone = () => { winRef.current = null; onClosedRef.current?.() }
    win.addEventListener('pagehide', onGone)
    let alive = true
    Promise.resolve().then(() => { if (alive) setBody(doc.body) }) // контейнер отдаём после открытия окна (не setState прямо в эффекте)
    return () => { alive = false; win.removeEventListener('pagehide', onGone); setBody(null); if (winRef.current) { winRef.current.close(); winRef.current = null } }
  }, [open, title, width, height])
  return body
}
