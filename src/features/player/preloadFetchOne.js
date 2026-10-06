import { pLog } from '../../shared/lib/debug.js'
import { enqueuePosterCapture } from './posterQueue.js'
import { fetchBlobWithRetry } from './preloadFetch.js'
import { analyzeWaveform, probeAudioDuration, WAVEFORM_FPS } from '../../shared/lib/audioUtils.js'
import { getAudioMeta, setAudioMeta } from '../../shared/lib/audioMetaCache.js'

// У каких файлов снимается кадр-постер, и какие выгружаются по мере ухода из
// окна чата (usePlayerPreload.js берёт отсюда же)
export const POSTER_TYPES = new Set(['video', 'circle', 'sticker'])
// Only heavy media is evicted — photos/stickers are small, photo_choice panels are special
export const EVICT_TYPES  = new Set(['audio', 'voice_record', 'video', 'circle', 'table'])
// Картинки декодируем заранее (Image.decode): иначе blob готов, а пузырь всё
// равно выходит пустым на первый кадр — декодирование шло уже в чате
export const DECODE_TYPES = new Set(['photo', 'sticker', 'photo_choice'])

// Загрузка одного файла очереди прогрева: скачивание с повторами и прогрессом,
// публикация blob-ссылки, мета голосового, выгрузка дальних, постер в фоне.
// Вынесено из usePlayerPreload.js (тот упирался в потолок 400 строк) без
// изменения логики: хук собирает fetchOne на каждом рендере из своих рефов,
// сеттеров и функций (ctx) — как раньше собирались вложенные функции
export function makePreloadFetch(ctx) {
  const {
    genRef, blobUrlsRef, setBlobMap, setReadyNodeIds, inFlightRef,
    debugItemsRef, bytesLoadedRef, bytesTotalRef, tick, throttledTick, markFailed,
    ts, checkNodeReady, evictFarthestIfNeeded, pump, byIdRef,
  } = ctx

  // Длительность и волна голосового — сразу после скачивания, а не при показе
  // (прогрев): пузырь монтируется с таймером и волной с первого кадра, без
  // подрастания, когда таймер «появляется позже». metaDone — анализ прошёл,
  // даже если ничего не вышло (тогда AudioModule считает сам)
  async function analyzeAudioMeta(id, blobUrl, gen, nodeId = null) {
    if (blobUrlsRef.current[id]?.metaStarted) return
    blobUrlsRef.current[id].metaStarted = true
    // Мета сохранена в ноде (редактор/досчёт в канвасе) — декодировать нечего
    const stored = nodeId ? byIdRef?.current?.[nodeId]?.typeData?.audio : null
    const cached = stored?.waveformData?.length
      ? { duration: stored.duration || null, waveformData: stored.waveformData }
      : getAudioMeta(id) // считали раньше (этот или другой урок с тем же файлом)
    let duration = cached?.duration ?? null
    let waveformData = cached?.waveformData ?? null
    const publish = patch => {
      if (genRef.current !== gen) return false
      const entry = blobUrlsRef.current[id]
      if (!entry?.blobUrl) return false
      blobUrlsRef.current[id] = { ...entry, ...patch }
      setBlobMap(prev => ({ ...prev, [id]: blobUrlsRef.current[id] }))
      return true
    }
    // Волна — главное: публикуем, как только посчитана, и это же «мета
    // готова» для гейта показа. Длительность — отдельно и best effort: iOS
    // без жеста не отдаёт loadedmetadata отдельному Audio(), проба уходила в
    // таймаут и держала всё 4 с; у пузыря длительность есть и из живого
    // <audio> (adoptElementDuration), в предрисовке она успевает
    if (!waveformData) waveformData = await analyzeWaveform(blobUrl).catch(() => null)
    // Длительность — сразу из самой волны (кадр = 1/WAVEFORM_FPS с): таймер
    // готов вместе со спектром, не дожидаясь пробы (iOS без жеста её не
    // отдаёт). Проба идёт следом; точное значение подменяет оценку, только
    // если расходится заметно (≥1 с) — иначе подпись «00:09» дёргалась бы
    const approx = waveformData?.length ? waveformData.length / WAVEFORM_FPS : null
    if (!publish({ waveformData, duration: duration ?? approx, metaDone: true })) return
    if (!duration) {
      const probed = await probeAudioDuration(blobUrl).catch(() => null)
      if (probed && (!approx || Math.abs(probed - approx) >= 1)) { duration = probed; publish({ duration }) }
      else duration = approx
    }
    if (!cached || cached.duration !== duration || cached.waveformData !== waveformData) setAudioMeta(id, { duration, waveformData })
  }

  // Картинка декодируется в памяти сразу после скачивания; элемент держим в
  // записи, чтобы декодированный кадр не вытеснился из кэша до показа
  function decodeImage(id, blobUrl) {
    if (typeof Image === 'undefined') return
    const im = new Image()
    im.src = blobUrl
    const done = () => { const e = blobUrlsRef.current[id]; if (e?.blobUrl === blobUrl) e.decodedImg = im }
    if (im.decode) im.decode().then(done).catch(() => {})
    else im.onload = done
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
    if (nodeType === 'audio') analyzeAudioMeta(id, blobUrl, gen, nodeId)
    if (DECODE_TYPES.has(nodeType)) decodeImage(id, blobUrl)

    if (EVICT_TYPES.has(nodeType)) await evictFarthestIfNeeded(gen, id)

    // Node is ready as soon as bytes are in memory. Poster capture must NOT gate
    // readiness — slow Android decoders take seconds per file and froze the launch bar.
    if (checkNodeReady(nodeId)) {
      setReadyNodeIds(prev => { const s = new Set(prev); s.add(nodeId); return s })
    }
    if (!POSTER_TYPES.has(nodeType)) return

    // Background: still frame for <video poster> / eviction placeholder, one at a time.
    enqueuePoster(id, blobUrl, gen)
  }

  // Постер в фоне (по одному, posterQueue.js). posterDone ставится и при
  // неудаче — готовность ноды (preloadWarm.js) ждёт «захват отработал», а не
  // «постер есть»: иначе битый ролик держал бы «печатает» до порога
  function enqueuePoster(id, blobUrl, gen) {
    enqueuePosterCapture(blobUrl, posterUrl => {
      const entry = blobUrlsRef.current[id]
      if (!posterUrl) pLog(`[poster] кадр не снят: ${String(id).slice(-12)} (таймаут/декодер) — нода покажется без постера`)
      if (genRef.current !== gen || !entry?.blobUrl || entry.posterUrl) {
        // gen changed, file evicted (eviction captures its own poster), or poster already set
        if (posterUrl) URL.revokeObjectURL(posterUrl)
        return
      }
      entry.posterDone = true
      if (posterUrl) entry.posterUrl = posterUrl
      setBlobMap(prev => ({ ...prev, [id]: { ...prev[id], posterDone: true, ...(posterUrl ? { posterUrl } : {}) } }))
    }, () => genRef.current === gen)
  }

  // Файлы, пришедшие из карточки запуска готовыми (handoff), но без меты
  // голосового / постера — карточка могла отдать их плееру раньше, чем
  // досчитала: раньше такие голосовые оставались без волны навсегда
  function finishHandoff(items, gen) {
    for (const item of items) {
      const entry = blobUrlsRef.current[item.id]
      if (!entry?.blobUrl) continue
      if (item.nodeType === 'audio' && !entry.metaDone) analyzeAudioMeta(item.id, entry.blobUrl, gen, item.nodeId)
      if (POSTER_TYPES.has(item.nodeType) && !entry.posterUrl && !entry.posterDone) enqueuePoster(item.id, entry.blobUrl, gen)
    }
  }
  fetchOne.finishHandoff = finishHandoff

  return fetchOne
}
