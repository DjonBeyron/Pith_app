// Копирование текста в буфер обмена (проба «Голос»): сначала Clipboard API, запасной способ — скрытое поле и execCommand.
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
