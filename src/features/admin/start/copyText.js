// Копирование текста в буфер: сначала Clipboard API, потом старый способ через textarea (iOS PWA иногда отказывает первому)
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch { /* нет доступа к буферу — пробуем старый способ */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch { return false }
}
