// Отправка дебаг-файлов в папку проекта (_debug/) через dev-эндпоинт Vite —
// см. tools/viteDebugSink.js. Смысл: Claude читает файл прямо с диска, ничего
// пересылать и искать в Downloads не нужно.
//
// Скачивание в браузер остаётся запасным путём: если dev-сервера нет (открыли
// прод-превью) или эндпоинт не ответил, файл всё равно не теряется.

const ENDPOINT = '/__pithy-debug'

export function debugFileName(kind) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `${kind}-${ts}`
}

function downloadFallback(name, payload) {
  // Лог плеера — уже готовый текст: прогонять его через JSON.stringify нельзя,
  // иначе файл окажется одной строкой в кавычках с \n вместо переносов
  const isText = typeof payload === 'string'
  const body = isText ? payload : JSON.stringify(payload, null, 2)
  const blob = new Blob([body], { type: isText ? 'text/plain' : 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.${isText ? 'txt' : 'json'}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Возвращает путь записанного файла (что показать человеку) либо null, если
// пришлось скачивать в браузер
export async function sendToSink(name, payload) {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, payload }),
    })
    if (!res.ok) throw new Error(`sink ответил ${res.status}`)
    const { file } = await res.json()
    return file
  } catch {
    downloadFallback(name, payload)
    return null
  }
}
