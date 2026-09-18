import { pLog } from '../../shared/lib/debug.js'

const MAX_ATTEMPTS       = 3
const RETRY_DELAY_MS     = 1200
const STALL_TIMEOUT_MS   = 15_000
// Первый байт ждём короче, чем паузу между чанками: если ответ не начался
// за 8 с, соединение почти наверняка «повисло» (холодный DNS/TLS, мобильная
// сеть), и держать его ещё 7 с — это те самые ~20 с с баром на нуле
// (15 с сторож + 1.2 с пауза + перекачка), после которых всё вдруг летит.
// Между чанками 15 с оставляем: большой файл на слабой сети может реально
// «думать» дольше 8 с, а обрыв посреди тела дороже, чем на старте
const FIRST_BYTE_TIMEOUT_MS = 8_000

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
      // В player-log — чтобы «бар стоял 20 секунд» потом можно было прочитать
      // по логу (обрыв на первом байте / посреди тела / HTTP), а не гадать
      pLog(`[preload] попытка ${attempt}/${MAX_ATTEMPTS} не удалась (${e.message}): ${url.split('/').pop()}`)
      if (attempt < MAX_ATTEMPTS && isAlive()) await sleep(RETRY_DELAY_MS * attempt)
    }
  }
  throw lastError
}

async function fetchOnce(url, onProgress, isAlive) {
  const controller = new AbortController()
  // Пока не пришёл заголовок ответа — короткий таймер; дальше — обычный сторож
  let stage = 'первый байт'
  let watchdog = setTimeout(() => controller.abort(), FIRST_BYTE_TIMEOUT_MS)
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
    stage = 'тело'
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
  } catch (e) {
    // AbortError от сторожа — переименовываем в понятное: где именно повисло
    if (e?.name === 'AbortError') throw new Error(`таймаут: ${stage}`)
    throw e
  } finally {
    clearTimeout(watchdog)
  }
}
