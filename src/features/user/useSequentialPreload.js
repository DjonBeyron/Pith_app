// ─────────────────────────────────────────────────────────────────────────────
// КАК РАБОТАЕТ СИСТЕМА ПРЕДЗАГРУЗКИ (useSequentialPreload)
// ─────────────────────────────────────────────────────────────────────────────
//
// 1. ПОСЛЕДОВАТЕЛЬНАЯ ОЧЕРЕДЬ
//    Файлы скачиваются строго по одному, в порядке массива `files`.
//    Следующий начинается только когда предыдущий полностью в памяти.
//    Никаких параллельных fetch — иначе на медленном 3G они «дерутся» за канал.
//    Очередь не убегает далеко вперёд: `allowUpTo` — внешний лимит, до которого
//    разрешено идти; пока не разрешено — ждём опросом каждые POLL_MS мс.
//
// 2. БУФЕР НА 5 ФАЙЛОВ (только видео/аудио)
//    Скачанные blob-ы держим в памяти. При переполнении вытесняем самый ранний
//    (с наименьшим порядковым номером в массиве), кроме того файла, что только
//    что загрузился — он остаётся. Буфер так «скользит» вперёд вместе с очередью.
//
//    Пример: буфер {21,22,23,24,25}, пользователь нажал на файл #10 (старый).
//    #10 загружается. Вытесняется #21 — наименьший из оставшихся.
//    Нажал #8 — вытесняется #10. Нажал #17 — вытесняется #8.
//
// 3. ФОТО НИКОГДА НЕ ВЫТЕСНЯЮТСЯ
//    Пустое фото в чате выглядело бы как поломка. Фото не входят в счётчик
//    буфера (max 5 считается только для видео/аудио).
//
// 4. ВИДЕО ПРИ ВЫТЕСНЕНИИ ОСТАВЛЯЕТ СТОП-КАДР
//    Перед удалением тяжёлого blob-а захватывается один кадр через скрытый
//    <video>+<canvas> и остаётся как превью. Если захват завис (слабый Android,
//    плохой кодек) — через 2 сек capturePosterFrame резолвится с null и вытеснение
//    всё равно происходит, чтобы очередь не встала мёртво.
//
// 5. ПОДГРУЗКА ПО ТРЕБОВАНИЮ
//    Клик на вытесненный файл (стоп-кадр видео или плейсхолдер аудио) вызывает
//    reload(f), который запускает loadOne для этого конкретного файла с текущим
//    поколением очереди. Этот файл при первом же переполнении буфера станет
//    первым кандидатом на вытеснение (он самый «ранний» в окне).
//
// ЗАЩИТА ОТ ДВУХ ПАРАЛЛЕЛЬНЫХ ОЧЕРЕДЕЙ (genRef)
//    Каждый запуск useEffect захватывает `gen = genRef.current`. Cleanup делает
//    genRef.current++. Любая async-операция (patch, loadOne, evict) проверяет
//    genRef.current === gen и тихо останавливается при несовпадении. Это гарантирует,
//    что повторный вызов load() (кнопка «Обновить») не запустит два queue одновременно.
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

// Downloads one file and streams progress. Keeps the connection serial so slow 3G
// isn't overloaded by parallel fetches fighting each other.
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
  // Generation counter — incremented on cleanup. Each async operation checks its own
  // captured `gen` against genRef.current; mismatch means a newer queue took over.
  const genRef = useRef(0)
  const filesByIdRef = useRef({})
  const indexByIdRef = useRef({})
  const cursorRef = useRef(0)
  const allowUpToRef = useRef(allowUpTo)
  const currentIndexRef = useRef(currentIndex)

  useEffect(() => { allowUpToRef.current = allowUpTo }, [allowUpTo])
  useEffect(() => { currentIndexRef.current = currentIndex }, [currentIndex])

  function patch(id, fields, gen) {
    if (genRef.current !== gen) return
    snapshotRef.current = { ...snapshotRef.current, [id]: { ...snapshotRef.current[id], ...fields } }
    setMap(snapshotRef.current)
  }

  function bufferedEvictableIds() {
    return Object.entries(snapshotRef.current)
      .filter(([id, rec]) => rec.status === 'ready' && getMediaKind(filesByIdRef.current[id]?.content_type) !== 'photo')
      .map(([id]) => id)
  }

  // Helper: human-readable position label for a file id, e.g. "#5"
  function pos(id) { return '#' + ((indexByIdRef.current[id] ?? 0) + 1) }

  // Eviction policy: remove the file with the LOWEST sequential index, excluding
  // `justLoadedId` (the file we just finished loading — keep it, it's the freshest).
  // This makes the buffer a sliding window: as the queue advances, the tail falls off.
  // On-demand loaded past files become the next eviction target without extra logic.
  // Photos are never included in candidates — bufferedEvictableIds() already filters them.
  async function evictFarthestIfNeeded(gen, justLoadedId) {
    let buffered = bufferedEvictableIds()
    while (buffered.length > BUFFER_SIZE) {
      if (genRef.current !== gen) return
      const candidates = buffered.filter(id => id !== justLoadedId)
      if (!candidates.length) break
      const evictId = candidates.reduce((minId, id) =>
        (indexByIdRef.current[id] ?? 0) < (indexByIdRef.current[minId] ?? 0) ? id : minId,
        candidates[0]
      )
      const rec = snapshotRef.current[evictId]
      const f = filesByIdRef.current[evictId]
      buffered = buffered.filter(id => id !== evictId)
      if (!rec || !f) continue

      // Debug: show all candidates (photos excluded), which is protected, which is chosen.
      const candidateList = candidates.map(id => pos(id)).join(', ')
      const protectedLabel = justLoadedId ? `защищён ${pos(justLoadedId)}` : 'нет защищённого'
      dbg(`[buffer] кандидаты (фото исключены): ${candidateList} | ${protectedLabel} → вытесняю наименьший ${pos(evictId)}`, f.file_name)

      if (getMediaKind(f.content_type) === 'video') {
        // Capture poster frame before revoking the blob. capturePosterFrame has a built-in
        // 2 s timeout so a stuck decoder on Android never blocks the queue indefinitely.
        let posterUrl = rec.posterUrl
        if (!posterUrl) {
          posterUrl = await capturePosterFrame(rec.blobUrl)
        }
        if (genRef.current !== gen) return
        URL.revokeObjectURL(rec.blobUrl)
        patch(evictId, { status: 'evicted', blobUrl: null, posterUrl }, gen)
      } else {
        URL.revokeObjectURL(rec.blobUrl)
        patch(evictId, { status: 'evicted', blobUrl: null }, gen)
      }
    }
  }

  async function loadOne(f, gen) {
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
        if (getMediaKind(f.content_type) !== 'photo') await evictFarthestIfNeeded(gen, f.id)
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
    if (!files.length) return () => { genRef.current++ }

    async function runQueue() {
      while (genRef.current === gen && cursorRef.current < files.length) {
        if (cursorRef.current >= allowUpToRef.current) {
          await sleep(POLL_MS)
          continue
        }
        const f = files[cursorRef.current]
        await loadOne(f, gen)
        cursorRef.current += 1
      }
    }
    runQueue()
    return () => { genRef.current++ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files])

  // Called when the user taps an evicted item — fetches it again on demand.
  // The on-demand file keeps its original sequential index, so it naturally becomes
  // the next eviction candidate if its index is lower than the rest of the buffer.
  function reload(f) {
    const cur = snapshotRef.current[f.id]
    if (cur && (cur.status === 'loading' || cur.status === 'ready')) return
    dbg(`[user] клик → ${pos(f.id)} ${f.file_name}`)
    loadOne(f, genRef.current)
  }

  return { state: map, reload }
}
