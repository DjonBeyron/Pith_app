// ─────────────────────────────────────────────────────────────────────────────
// КАК РАБОТАЕТ СИСТЕМА ПРЕДЗАГРУЗКИ (useSequentialPreload)
// ─────────────────────────────────────────────────────────────────────────────
//
// 1. ПОСЛЕДОВАТЕЛЬНАЯ ОЧЕРЕДЬ
//    Файлы скачиваются строго по одному. Не уходит дальше `allowUpTo`
//    (= reveal + PREFETCH_LOOKAHEAD), ждёт разрешения опросом каждые POLL_MS мс.
//
// 2. БУФЕР НА 5 ПОКАЗАННЫХ ФАЙЛОВ (только видео/аудио)
//    «Показанный» = файл с порядковым номером ≤ currentIndex (уже открыт
//    пользователю reveal-ом). Предзагруженные-вперёд (ещё не показанные)
//    не входят в лимит и могут быть в памяти сверх пяти. Итого в памяти:
//    до BUFFER_SIZE показанных + до PREFETCH_LOOKAHEAD вперёд.
//
//    Вытеснение запускается только когда показанных audio/video > BUFFER_SIZE.
//    Пока пользователь видит ≤5 файлов — ни один из них не выгружается.
//    Вытеснение также проверяется при каждом сдвиге reveal (currentIndex).
//
// 3. ФОТО НИКОГДА НЕ ВЫТЕСНЯЮТСЯ — не входят в счётчик и в кандидаты.
//
// 4. ВИДЕО ПРИ ВЫТЕСНЕНИИ ОСТАВЛЯЕТ СТОП-КАДР
//    capturePosterFrame имеет таймаут 2 с — зависший декодер Android не
//    блокирует очередь. Файл помечен в evictingIdsRef до завершения захвата.
//
// 5. ПРАВИЛА ВЫТЕСНЕНИЯ (source-aware):
//    Sequential (автоочередь) → вытесняет только показанные файлы, которые
//    НЕ были запрошены пользователем вручную (user-req защищены).
//
//    Demand (клик пользователя) → может вытеснить любой показанный кандидат,
//    включая ранее demand-загруженные. Пример: буфер {21,22,23,24,25}.
//    Клик #10 → вытесняет #21. Клик #8 → вытесняет #10. Клик #17 → #8.
//
// 6. ЗАЩИТА ОТ ДВУХ ПАРАЛЛЕЛЬНЫХ ОЧЕРЕДЕЙ (genRef)
//    Cleanup делает genRef.current++. Все async-операции проверяют свой gen.
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
  const userRequestedIdsRef = useRef(new Set())
  const evictingIdsRef = useRef(new Set())

  useEffect(() => { allowUpToRef.current = allowUpTo }, [allowUpTo])

  function patch(id, fields, gen) {
    if (genRef.current !== gen) return
    snapshotRef.current = { ...snapshotRef.current, [id]: { ...snapshotRef.current[id], ...fields } }
    setMap(snapshotRef.current)
  }

  function pos(id) { return id ? '#' + ((indexByIdRef.current[id] ?? 0) + 1) : '—' }

  // All ready audio/video (including preloaded-ahead) — for total-in-memory log only.
  function allEvictableIds() {
    return Object.entries(snapshotRef.current)
      .filter(([id, rec]) =>
        rec.status === 'ready' &&
        !evictingIdsRef.current.has(id) &&
        getMediaKind(filesByIdRef.current[id]?.content_type) !== 'photo'
      )
      .map(([id]) => id)
  }

  // Only files already REVEALED to the user (index ≤ currentIndex).
  // These count against BUFFER_SIZE. Preloaded-ahead files are free.
  function revealedEvictableIds() {
    const cur = currentIndexRef.current
    return Object.entries(snapshotRef.current)
      .filter(([id, rec]) =>
        rec.status === 'ready' &&
        !evictingIdsRef.current.has(id) &&
        getMediaKind(filesByIdRef.current[id]?.content_type) !== 'photo' &&
        (indexByIdRef.current[id] ?? 0) <= cur
      )
      .map(([id]) => id)
  }

  // Eviction fires only when REVEALED audio/video count > BUFFER_SIZE.
  // Preloaded-ahead files are never evicted here — they're outside the limit.
  // source='sequential' skips user-requested files; source='demand' evicts all candidates.
  async function evictFarthestIfNeeded(gen, justLoadedId, source) {
    let revealed = revealedEvictableIds()
    while (revealed.length > BUFFER_SIZE) {
      if (genRef.current !== gen) return
      const candidates = justLoadedId ? revealed.filter(id => id !== justLoadedId) : revealed
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
      if (evictingIdsRef.current.has(evictId)) {
        revealed = revealed.filter(id => id !== evictId)
        continue
      }

      const rec = snapshotRef.current[evictId]
      const f = filesByIdRef.current[evictId]
      const revealedBefore = revealed.length
      const totalInMem = allEvictableIds().length
      revealed = revealed.filter(id => id !== evictId)
      if (!rec || !f) continue

      evictingIdsRef.current.add(evictId)
      userRequestedIdsRef.current.delete(evictId)

      const userReqLabel = userRequestedIdsRef.current.size
        ? ` user-req: ${[...userRequestedIdsRef.current].map(pos).join(',')}` : ''
      dbg(`[buffer] показано ${revealedBefore}→${BUFFER_SIZE} (в памяти ${totalInMem}) | кандидаты: ${candidates.map(pos).join(', ')} | защищён: ${pos(justLoadedId)} src=${source}${userReqLabel} → вытесняю ${pos(evictId)}`, f.file_name)

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

  // When reveal advances, preloaded-ahead files become "revealed" — trigger eviction check
  // so the revealed count stays ≤ BUFFER_SIZE even when no new file is being loaded.
  // Must be declared after evictFarthestIfNeeded to satisfy react-hooks/immutability.
  useEffect(() => {
    currentIndexRef.current = currentIndex
    const gen = genRef.current
    evictFarthestIfNeeded(gen, null, 'sequential').catch(console.error)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex])

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
        if (genRef.current === gen) cursorRef.current += 1
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
