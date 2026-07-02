const MAX_ATTEMPTS     = 3
const RETRY_DELAY_MS   = 1200
const STALL_TIMEOUT_MS = 15_000

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// Скачивает файл в Blob с прогрессом и до MAX_ATTEMPTS попыток (задержка растёт с попыткой).
// Watchdog перезапускается на каждом чанке: обрывает соединение, если байты не приходят
// STALL_TIMEOUT_MS подряд — иначе зависший стрим на мобильной сети висит вечно и навсегда
// занимает слот параллельной загрузки. isAlive() — проверка поколения очереди: false → null.
export async function fetchBlobWithRetry(url, { onProgress, isAlive }) {
  let lastError = null
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (!isAlive()) return null
    try {
      return await fetchOnce(url, onProgress, isAlive)
    } catch (e) {
      lastError = e
      if (attempt < MAX_ATTEMPTS && isAlive()) await sleep(RETRY_DELAY_MS * attempt)
    }
  }
  throw lastError
}

async function fetchOnce(url, onProgress, isAlive) {
  const controller = new AbortController()
  let watchdog = setTimeout(() => controller.abort(), STALL_TIMEOUT_MS)
  const kick = () => {
    clearTimeout(watchdog)
    watchdog = setTimeout(() => controller.abort(), STALL_TIMEOUT_MS)
  }
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`)
      err.httpStatus = res.status
      throw err
    }
    kick()
    const total  = Number(res.headers.get('content-length')) || 0
    const reader = res.body.getReader()
    const chunks = []
    let loaded = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!isAlive()) { reader.cancel().catch(() => {}); return null }
      kick()
      chunks.push(value)
      loaded += value.length
      onProgress(loaded, total)
    }
    return { blob: new Blob(chunks), httpStatus: res.status }
  } finally {
    clearTimeout(watchdog)
  }
}
