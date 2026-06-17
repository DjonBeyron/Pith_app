// ─────────────────────────────────────────────────────────────────────────────
// КАК РАБОТАЕТ СИСТЕМА ПРЕДЗАГРУЗКИ (useSequentialPreload)
// ─────────────────────────────────────────────────────────────────────────────
//
// 1. ПОСЛЕДОВАТЕЛЬНАЯ ОЧЕРЕДЬ
//    Файлы скачиваются строго по одному. Очередь не убегает дальше `allowUpTo`
//    (= reveal + PREFETCH_LOOKAHEAD), ждёт разрешения опросом каждые POLL_MS мс.
//
// 2. БУФЕР НА 5 ФАЙЛОВ (только видео/аудио)
//    Готовые blob-ы держим в памяти. При переполнении — вытесняем наименьший
//    из допустимых кандидатов (см. ниже).
//
// 3. ФОТО НИКОГДА НЕ ВЫТЕСНЯЮТСЯ
//    Не входят в счётчик буфера и в кандидаты на вытеснение.
//
// 4. ВИДЕО ПРИ ВЫТЕСНЕНИИ ОСТАВЛЯЕТ СТОП-КАДР
//    capturePosterFrame имеет таймаут 2 с — зависший декодер Android не блокирует
//    очередь. Пока идёт захват, файл помечен во внутреннем `evictingIdsRef` и не
//    попадает в кандидаты повторно (защита от двойного вытеснения).
//
// 5. ПРАВИЛА ВЫТЕСНЕНИЯ (source-aware):
//    Sequential загрузка (автоочередь) → вытесняет только файлы, которые НЕ были
//    запрошены пользователем вручную. User-clicked файлы защищены от выброса
//    автоочередью — они остаются пока пользователь сам не нажмёт на что-то ещё.
//
//    Demand загрузка (клик пользователя) → может вытеснить любой кандидат,
//    включая ранее demand-загруженные. Пример: буфер {21,22,23,24,25}.
//    Клик на #10 → вытесняется #21 (наименьший из seq).
//    Клик на #8  → вытесняется #10 (наименьший из всех, включая demand).
//    Клик на #17 → вытесняется #8.
//
// 6. ЗАЩИТА ОТ ДВУХ ПАРАЛЛЕЛЬНЫХ ОЧЕРЕДЕЙ (genRef)
//    Cleanup эффекта делает genRef.current++. Все async-операции проверяют свой
//    `gen` — при несовпадении тихо выходят. Это гарантирует, что повторный
//    вызов load() не запустит два queue одновременно.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { formatBytes, getMediaKind } from '../../shared/lib/filesApi.js'
import { dbg } from '../../shared/lib/debug.js'
import { capturePosterFrame } from '../../shared/lib/videoFrame.js'

const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 1500
const POLL_MS = 300
export const BUFFER_SIZE = 5

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchBlobWithProgress(url, onProgress) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const total = Number(res.headers.get('content-length')) || 0
  const reader = res.body.getReader()
  const chunks = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    if (total) onProgress(Math.round((loaded / total) * 100))
  }
  return new Blob(chunks)
}

export function useSequentialPreload(files, allowUpTo, currentIndex) {
  const [map, setMap] = useState({})
  const snapshotRef = useRef({})
  const genRef = useRef(0)
  const filesByIdRef = useRef({})
  const indexByIdRef = useRef({})
  const cursorRef = useRef(0)
  const allowUpToRef = useRef(allowUpTo)
  const currentIndexRef = useRef(currentIndex)
  // Tracks files loaded on user demand — sequential eviction skips them.
  const userRequestedIdsRef = useRef(new Set())
  // Tracks files currently mid-eviction (poster capture) — prevents double-evict.
  const evictingIdsRef = useRef(new Set())

  useEffect(() => { allowUpToRef.current = allowUpTo }, [allowUpTo])
  useEffect(() => { currentIndexRef.current = currentIndex }, [currentIndex])

  function patch(id, fields, gen) {
    if (genRef.current !== gen) return
    snapshotRef.current = { ...snapshotRef.current, [id]: { ...snapshotRef.current[id], ...fields } }
    setMap(snapshotRef.current)
  }

  // Human-readable position label for debug logs, e.g. "#5"
  function pos(id) { return '#' + ((indexByIdRef.current[id] ?? 0) + 1) }

  // Photos and files already mid-eviction are excluded from candidates.
  function bufferedEvictableIds() {
    return Object.entries(snapshotRef.current)
      .filter(([id, rec]) =>
        rec.status === 'ready' &&
        !evictingIdsRef.current.has(id) &&
        getMediaKind(filesByIdRef.current[id]?.content_type) !== 'photo'
      )
      .map(([id]) => id)
  }

  // source='sequential' → protect user-clicked files (evict from seq pool only).
  // source='demand'     → evict from all candidates (lowest index, excl just-loaded).
  async function evictFarthestIfNeeded(gen, justLoadedId, source) {
    let buffered = bufferedEvictableIds()
    while (buffered.length > BUFFER_SIZE) {
      if (genRef.current !== gen) return
      const candidates = buffered.filter(id => id !== justLoadedId)
      if (!candidates.length) break

      let pool = candidates
      if (source === 'sequential') {
        const seqPool = candidates.filter(id => !userRequestedIdsRef.current.has(id))
        if (seqPool.length > 0) pool = seqPool
      }

      const evictId = pool.reduce((minId, id) =>
        (indexByIdRef.current[id] ?? 0) < (indexByIdRef.current[minId] ?? 0) ? id : minId,
        pool[0]
      )
      const rec = snapshotRef.current[evictId]
      const f = filesByIdRef.current[evictId]
      // Capture BEFORE filter: sizeBeforeEvict = кандидаты + защищённый = реальный размер буфера,
      // именно это значение > BUFFER_SIZE и спровоцировало вытеснение.
      const sizeBeforeEvict = buffered.length
      buffered = buffered.filter(id => id !== evictId)
      if (!rec || !f) continue

      // Lock before any await so concurrent calls don't double-evict the same file.
      evictingIdsRef.current.add(evictId)
      userRequestedIdsRef.current.delete(evictId)

      const userReqLabel = userRequestedIdsRef.current.size
        ? ` user-req защищены: ${[...userRequestedIdsRef.current].map(pos).join(',')}` : ''
      dbg(`[buffer] ${sizeBeforeEvict}→${BUFFER_SIZE} | кандидаты: ${candidates.map(pos).join(', ')} | защищён: ${pos(justLoadedId)} src=${source}${userReqLabel} → вытесняю ${pos(evictId)}`, f.file_name)

      if (getMediaKind(f.content_type) === 'video') {
        let posterUrl = rec.posterUrl
        if (!posterUrl) posterUrl = await capturePosterFrame(rec.blobUrl)
        if (genRef.current !== gen) { evictingIdsRef.current.delete(evictId); return }
        URL.revokeObjectURL(rec.blobUrl)
        patch(evictId, { status: 'evicted', blobUrl: null, posterUrl }, gen)
      } else {
        URL.revokeObjectURL(rec.blobUrl)
        patch(evictId, { status: 'evicted', blobUrl: null }, gen)
      }
      evictingIdsRef.current.delete(evictId)
    }
  }

  async function loadOne(f, gen, source = 'sequential') {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (genRef.current !== gen) return
      patch(f.id, { status: 'loading', progress: 0, attempt }, gen)
      const t0 = performance.now()
      dbg('[preload] start', f.file_name, formatBytes(f.size_bytes), `попытка ${attempt}/${MAX_ATTEMPTS}`)
      try {
        const blob = await fetchBlobWithProgress(f.r2_url, progress => {
          patch(f.id, { status: 'loading', progress, attempt }, gen)
        })
        if (genRef.current !== gen) return
        const ms = Math.round(performance.now() - t0)
        const kbps = Math.round(blob.size / 1024 / (ms / 1000))
        dbg('[preload] done', f.file_name, `${ms}ms`, `${kbps} KB/s`)
        const blobUrl = URL.createObjectURL(blob)
        if (genRef.current !== gen) { URL.revokeObjectURL(blobUrl); return }
        patch(f.id, { status: 'ready', progress: 100, blobUrl, ms, kbps }, gen)
        if (getMediaKind(f.content_type) !== 'photo') await evictFarthestIfNeeded(gen, f.id, source)
        return
      } catch (e) {
        console.error('[preload] attempt failed', f.file_name, attempt, e)
        dbg('[preload] attempt failed', f.file_name, `попытка ${attempt}/${MAX_ATTEMPTS}`)
        if (attempt < MAX_ATTEMPTS && genRef.current === gen) await sleep(RETRY_DELAY_MS)
      }
    }
    if (genRef.current === gen) patch(f.id, { status: 'error', progress: 0 }, gen)
  }

  useEffect(() => {
    const gen = genRef.current
    Object.values(snapshotRef.current).forEach(rec => {
      if (rec?.blobUrl) URL.revokeObjectURL(rec.blobUrl)
      if (rec?.posterUrl) URL.revokeObjectURL(rec.posterUrl)
    })
    filesByIdRef.current = {}
    indexByIdRef.current = {}
    files.forEach((f, idx) => {
      filesByIdRef.current[f.id] = f
      indexByIdRef.current[f.id] = idx
    })
    cursorRef.current = 0
    snapshotRef.current = Object.fromEntries(files.map(f => [f.id, { status: 'queued', progress: 0 }]))
    setMap(snapshotRef.current)

    async function runQueue() {
      while (genRef.current === gen && cursorRef.current < files.length) {
        if (cursorRef.current >= allowUpToRef.current) {
          await sleep(POLL_MS)
          continue
        }
        const f = files[cursorRef.current]
        await loadOne(f, gen, 'sequential')
        cursorRef.current += 1
      }
    }
    if (files.length) runQueue()

    return () => {
      genRef.current++
      userRequestedIdsRef.current.clear()
      evictingIdsRef.current.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files])

  // User tapped an evicted item — load on demand.
  // Sequential queue will NOT evict this file until the user demands another one.
  function reload(f) {
    const cur = snapshotRef.current[f.id]
    if (cur && (cur.status === 'loading' || cur.status === 'ready')) return
    dbg(`[user] клик → ${pos(f.id)} ${f.file_name}`)
    userRequestedIdsRef.current.add(f.id)
    loadOne(f, genRef.current, 'demand')
  }

  return { state: map, reload }
}
