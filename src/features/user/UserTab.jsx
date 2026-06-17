import { useEffect, useRef, useState } from 'react'
import { listFiles, formatBytes, getMediaKind } from '../../shared/lib/filesApi.js'
import { dbg } from '../../shared/lib/debug.js'
import { useSequentialPreload, BUFFER_SIZE } from './useSequentialPreload.js'

const REVEAL_INTERVAL_MS = 3000
const PREFETCH_LOOKAHEAD = 3

function statusText(s) {
  if (!s || s.status === 'queued') return 'В очереди'
  if (s.status === 'loading') {
    const retry = s.attempt > 1 ? ` (попытка ${s.attempt}/3)` : ''
    return `Загружается... ${s.progress}%${retry}`
  }
  if (s.status === 'error') return 'Ошибка загрузки (после 3 попыток)'
  return `Готово · ${s.kbps} КБ/с · ${s.ms}мс`
}

function renderMedia(f, s, onReload) {
  const kind = getMediaKind(f.content_type)

  if (s?.status === 'ready') {
    if (kind === 'photo') return <img src={s.blobUrl} alt={f.file_name} />
    if (kind === 'video') return <video src={s.blobUrl} controls />
    if (kind === 'audio') return <audio src={s.blobUrl} controls />
    return <div className="unknownType">Неизвестный тип файла</div>
  }

  if (s?.status === 'evicted') {
    if (kind === 'video' && s.posterUrl) {
      return (
        <div className="evictedVideo" onClick={onReload}>
          <img src={s.posterUrl} alt={f.file_name} />
          <div className="evictedOverlay">▶ Загрузить видео</div>
        </div>
      )
    }
    return (
      <div className="fileCardPlaceholder fileCardClickable" onClick={onReload}>
        🔄 Выгружено — нажми, чтобы загрузить
      </div>
    )
  }

  return <div className="fileCardPlaceholder">{statusText(s)}</div>
}

// Logs current buffer occupancy whenever it changes — this is what lets us confirm from a
// downloaded debug log (no devtools on a weak Android phone) that memory really stays capped.
function useBufferLog(files, preloadState, currentIndex) {
  const lastSigRef = useRef('')
  useEffect(() => {
    const ready = files.filter(f => preloadState[f.id]?.status === 'ready')
    const sig = ready.map(f => f.id).join(',')
    if (sig === lastSigRef.current) return
    lastSigRef.current = sig
    const avReady = ready.filter(f => getMediaKind(f.content_type) !== 'photo')
    const revealedAv = avReady.filter(f => files.indexOf(f) <= currentIndex).length
    const photos = ready.length - avReady.length
    const totalKb = ready.reduce((sum, f) => sum + f.size_bytes, 0) / 1024
    const heap = performance.memory
      ? ` · JS heap: ${Math.round(performance.memory.usedJSHeapSize / 1024 / 1024)}MB`
      : ''
    dbg(
      `[buffer] видео/аудио в памяти: ${avReady.length} (показанных ${revealedAv} из max ${BUFFER_SIZE})`,
      `· фото: ${photos} (~${Math.round(totalKb)}KB)${heap}`,
    )
  }, [files, preloadState, currentIndex])
}

export default function UserTab() {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [visibleCount, setVisibleCount] = useState(0)
  const allowUpTo = visibleCount + PREFETCH_LOOKAHEAD
  const currentIndex = Math.max(0, visibleCount - 1)
  const { state: preload, reload } = useSequentialPreload(files, allowUpTo, currentIndex)
  useBufferLog(files, preload, currentIndex)

  useEffect(() => {
    load()
  }, [])

  // Simulates messages arriving one by one in a chat — reveals one more file every 3s.
  // Prefetch (in the hook) is capped at `allowUpTo`, so it stays a few messages ahead of
  // this instead of racing through the whole list immediately.
  useEffect(() => {
    if (visibleCount >= files.length) return
    dbg('[reveal] показано', visibleCount, '· разрешено грузить до', allowUpTo)
    const t = setTimeout(() => setVisibleCount(c => c + 1), REVEAL_INTERVAL_MS)
    return () => clearTimeout(t)
  }, [visibleCount, files.length, allowUpTo])

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
                <div className="fileCardMedia">{renderMedia(f, s, () => reload(f))}</div>
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
