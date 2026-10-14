// Мелкие браузерные утилиты подвкладки «Сцены»: скачать текст файлом (Blob + <a download>
// — работает внутри PWA и в Vercel-сборке) и скопировать в буфер с запасным вариантом.

export function downloadText(filename, text, type = 'text/plain;charset=utf-8') {
  try {
    const blob = new Blob([text], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return true
  } catch { return false }
}

// true — скопировано; false — не вышло (пользователю: «выделите текст вручную»)
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true }
  } catch { /* дальше запасной способ */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch { return false }
}

// Читает File (input type=file) как текст
export function readFileText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result ?? ''))
    r.onerror = () => reject(new Error('Не удалось прочитать файл'))
    r.readAsText(file)
  })
}

export const svgDataUrl = svgText => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`
