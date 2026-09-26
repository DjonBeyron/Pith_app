import { enqueuePosterCapture } from './posterQueue.js'
import { fetchBlobWithRetry } from './preloadFetch.js'
import { analyzeWaveform, probeAudioDuration } from '../../shared/lib/audioUtils.js'

// У каких файлов снимается кадр-постер, и какие выгружаются по мере ухода из
// окна чата (usePlayerPreload.js берёт отсюда же)
export const POSTER_TYPES = new Set(['video', 'circle', 'sticker'])
// Only heavy media is evicted — photos/stickers are small, photo_choice panels are special
export const EVICT_TYPES  = new Set(['audio', 'voice_record', 'video', 'circle', 'table'])

// Загрузка одного файла очереди прогрева: скачивание с повторами и прогрессом,
// публикация blob-ссылки, мета голосового, выгрузка дальних, постер в фоне.
// Вынесено из usePlayerPreload.js (тот упирался в потолок 400 строк) без
// изменения логики: хук собирает fetchOne на каждом рендере из своих рефов,
// сеттеров и функций (ctx) — как раньше собирались вложенные функции
export function makePreloadFetch(ctx) {
  const {
    genRef, blobUrlsRef, setBlobMap, setReadyNodeIds, inFlightRef,
    debugItemsRef, bytesLoadedRef, bytesTotalRef, tick, throttledTick, markFailed,
    ts, checkNodeReady, evictFarthestIfNeeded, pump,
  } = ctx

  // Длительность и волна голосового — сразу после скачивания, а не при показе
  // (прогрев): пузырь монтируется с таймером и волной с первого кадра, без
  // подрастания, когда таймер «появляется позже». metaDone — анализ прошёл,
  // даже если ничего не вышло (тогда AudioModule считает сам)
  async function analyzeAudioMeta(id, blobUrl, gen) {
    const [duration, waveformData] = await Promise.all([
      probeAudioDuration(blobUrl).catch(() => null),
      analyzeWaveform(blobUrl).catch(() => null),
    ])
    if (genRef.current !== gen) return
    const entry = blobUrlsRef.current[id]
    if (!entry?.blobUrl) return
    blobUrlsRef.current[id] = { ...entry, duration, waveformData, metaDone: true }
    setBlobMap(prev => ({ ...prev, [id]: blobUrlsRef.current[id] }))
  }

  async function fetchOne(item, gen) {
    const { id, url, nodeType, nodeSeq, nodeId } = item
    const key = `${nodeSeq}_${id}`
    const debugItem = {
      key, seq: nodeSeq, type: nodeType, url, startTs: ts(),
      readyTs: null, sizeKb: null, msgTs: null, status: 'start', error: null, httpStatus: null,
    }
    debugItemsRef.current.set(key, debugItem)
    tick()
    inFlightRef.current++

    let result = null
    try {
      result = await fetchBlobWithRetry(url, {
        isAlive: () => genRef.current === gen,
        onProgress: (loaded, total) => {
          bytesLoadedRef.current.set(id, loaded)
          if (total) {
            bytesTotalRef.current.set(id, total)
            debugItem.progress = Math.round(loaded / total * 100)
          }
          throttledTick()
        },
      })
    } catch (e) {
      debugItem.status     = 'error'
      debugItem.error      = e.message
      debugItem.httpStatus = e.httpStatus ?? null
      debugItem.readyTs    = ts()
      // Файл не скачался после всех попыток — для бара считается «завершённым»
      markFailed(id, item.size)
      blobUrlsRef.current[id] = { blobUrl: null, error: true }
      setBlobMap(prev => ({ ...prev, [id]: { blobUrl: null, error: true } }))
      tick()
      inFlightRef.current--
      // Mark node ready even on error so progress bar doesn't freeze
      if (checkNodeReady(nodeId)) {
        setReadyNodeIds(prev => { const s = new Set(prev); s.add(nodeId); return s })
      }
      pump(gen)
      return
    }
    if (!result || genRef.current !== gen) { inFlightRef.current--; return }

    const blob    = result.blob
    const blobUrl = URL.createObjectURL(blob)
    debugItem.httpStatus = result.httpStatus
    debugItem.readyTs  = ts()
    debugItem.sizeKb   = Math.round(blob.size / 1024)
    debugItem.status   = 'ready'
    debugItem.progress = 100
    bytesTotalRef.current.set(id, blob.size)
    bytesLoadedRef.current.set(id, blob.size)
    tick()

    // Release download slot and immediately start the next queued download
    inFlightRef.current--

    // Publish blobUrl so already-visible modules can start using it immediately
    blobUrlsRef.current[id] = { blobUrl, posterUrl: null }
    setBlobMap(prev => ({ ...prev, [id]: { blobUrl, posterUrl: null } }))
    pump(gen)
    if (nodeType === 'audio') analyzeAudioMeta(id, blobUrl, gen)

    if (EVICT_TYPES.has(nodeType)) await evictFarthestIfNeeded(gen, id)

    // Node is ready as soon as bytes are in memory. Poster capture must NOT gate
    // readiness — slow Android decoders take seconds per file and froze the launch bar.
    if (checkNodeReady(nodeId)) {
      setReadyNodeIds(prev => { const s = new Set(prev); s.add(nodeId); return s })
    }
    if (!POSTER_TYPES.has(nodeType)) return

    // Background: still frame for <video poster> / eviction placeholder, one at a time.
    enqueuePosterCapture(blobUrl, posterUrl => {
      if (!posterUrl) return
      const entry = blobUrlsRef.current[id]
      if (genRef.current !== gen || !entry?.blobUrl || entry.posterUrl) {
        // gen changed, file evicted (eviction captures its own poster), or poster already set
        URL.revokeObjectURL(posterUrl)
        return
      }
      entry.posterUrl = posterUrl
      setBlobMap(prev => ({ ...prev, [id]: { ...prev[id], posterUrl } }))
    })
  }

  return fetchOne
}
