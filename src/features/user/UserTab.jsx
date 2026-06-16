import { useEffect, useRef, useState } from 'react'
import { listFiles, formatBytes } from '../../shared/lib/filesApi.js'
import { dbg } from '../../shared/lib/debug.js'
import { useSequentialPreload } from './useSequentialPreload.js'

const REVEAL_INTERVAL_MS = 3000
const BUFFER_SIZE = 5

function renderMedia(f, blobUrl) {
  const type = f.content_type || ''
  if (type.startsWith('image/')) return <img src={blobUrl} alt={f.file_name} />
  if (type.startsWith('video/')) return <video src={blobUrl} controls />
  if (type.startsWith('audio/')) return <audio src={blobUrl} controls />
  return <div className="unknownType">Неизвестный тип файла</div>
}

function statusText(s) {
  if (!s || s.status === 'queued') return 'В очереди'
  if (s.status === 'loading') {
    const retry = s.attempt > 1 ? ` (попытка ${s.attempt}/3)` : ''
    return `Загружается... ${s.progress}%${retry}`
  }
  if (s.status === 'error') return 'Ошибка загрузки (после 3 попыток)'
  if (s.status === 'evicted') return '🗑 выгружено из памяти (вне последних 5)'
  return `Готово · ${s.kbps} КБ/с · ${s.ms}мс`
}

// Logs current buffer occupancy whenever it changes — this is what lets us confirm from a
// downloaded debug log (no devtools on a weak Android phone) that memory really stays capped.
function useBufferLog(files, preloadState) {
  const lastSigRef = useRef('')
  useEffect(() => {
    const readyFiles = files.filter(f => preloadState[f.id]?.status === 'ready')
    const sig = readyFiles.map(f => f.id).join(',')
    if (sig === lastSigRef.current) return
    lastSigRef.current = sig
    const totalKb = readyFiles.reduce((sum, f) => sum + f.size_bytes, 0) / 1024
    const heap = performance.memory
      ? ` · JS heap: ${Math.round(performance.memory.usedJSHeapSize / 1024 / 1024)}MB`
      : ''
    dbg('[buffer] в памяти сейчас', readyFiles.length, 'из max', BUFFER_SIZE, `(~${Math.round(totalKb)}KB)${heap}`)
  }, [files, preloadState])
}

export default function UserTab() {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [visibleCount, setVisibleCount] = useState(0)
  const { state: preload, evict } = useSequentialPreload(files)
  useBufferLog(files, preload)

  useEffect(() => {
    load()
  }, [])

  // Simulates messages arriving one by one in a chat — reveals one more file every 3s.
  useEffect(() => {
    if (visibleCount >= files.length) return
    const t = setTimeout(() => setVisibleCount(c => c + 1), REVEAL_INTERVAL_MS)
    return () => clearTimeout(t)
  }, [visibleCount, files.length])

  // Once a new file is revealed, evict whatever fell more than BUFFER_SIZE messages behind it.
  useEffect(() => {
    const evictIdx = visibleCount - 1 - BUFFER_SIZE
    if (evictIdx >= 0) evict(files[evictIdx].id, files[evictIdx].file_name)
  }, [visibleCount, files, evict])

  async function load() {
    setLoading(true)
    setError('')
    setVisibleCount(0)
    const t0 = performance.now()
    try {
      dbg('[user] fetching files...')
      const data = await listFiles()
      dbg('[user] fetched', data.length, `${Math.round(performance.now() - t0)}ms`)
      // Sequence = upload order, oldest first — simulates the order messages would appear in a chat.
      const ordered = [...data].sort((a, b) => new Date(a.uploaded_at) - new Date(b.uploaded_at))
      setFiles(ordered)
    } catch (e) {
      console.error('[user] load failed', e)
      setError('Не удалось загрузить список файлов')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="userPanel">
      <div className="toolbar">
        <button onClick={load} disabled={loading}>Обновить</button>
      </div>
      {error && <div className="errorText">{error}</div>}
      {loading ? (
        <div>Загрузка...</div>
      ) : (
        <div className="fileGrid">
          {files.slice(0, visibleCount).map((f, idx) => {
            const s = preload[f.id]
            return (
              <div className="fileCard" key={f.id}>
                <div className="fileCardSeq">#{idx + 1}</div>
                <div className="fileCardMedia">
                  {s?.status === 'ready'
                    ? renderMedia(f, s.blobUrl)
                    : <div className="fileCardPlaceholder">{statusText(s)}</div>}
                </div>
                <div className="fileCardName">{f.file_name}</div>
                <div className="fileCardMeta">{formatBytes(f.size_bytes)}</div>
              </div>
            )
          })}
          {files.length === 0 && <div>На сервере пока нет файлов</div>}
        </div>
      )}
    </div>
  )
}
