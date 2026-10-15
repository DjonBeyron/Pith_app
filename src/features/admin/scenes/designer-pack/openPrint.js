// Печать HTML-документа из приложения без всплывающих окон: скрытый iframe с srcdoc
// (тот же origin → contentWindow.print() разрешён), после загрузки — print(); iframe
// удаляется после afterprint или по таймауту. Возвращает false, если браузер не дал
// (тогда кнопка предлагает скачать .html и напечатать из него).

export function printHtml(html, { timeoutMs = 120000 } = {}) {
  try {
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.setAttribute('title', 'Печать документа')
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none'
    let done = false
    const cleanup = () => { if (done) return; done = true; frame.remove() }
    frame.addEventListener('load', () => {
      const win = frame.contentWindow
      if (!win) { cleanup(); return }
      win.addEventListener('afterprint', () => setTimeout(cleanup, 300))
      // Ждём кадр, чтобы макет и inline-SVG успели разложиться до снимка печати
      win.requestAnimationFrame(() => { try { win.focus(); win.print() } catch { cleanup() } })
    })
    frame.srcdoc = html
    document.body.appendChild(frame)
    setTimeout(cleanup, timeoutMs)
    return true
  } catch { return false }
}
