import { useEffect, useState } from 'react'
import { listFiles, formatBytes } from '../../shared/lib/filesApi.js'
import { dbg } from '../../shared/lib/debug.js'
import { useSequentialPreload } from './useSequentialPreload.js'

function renderMedia(f, blobUrl) {
  const type = f.content_type || ''
  const src = blobUrl
  if (type.startsWith('image/')) return <img src={src} alt={f.file_name} />
  if (type.startsWith('video/')) return <video src={src} controls />
  if (type.startsWith('audio/')) return <audio src={src} controls />
  return <div className="unknownType">Неизвестный тип файла</div>
}

function statusText(s) {
  if (!s || s.status === 'queued') return 'В очереди'
  if (s.status === 'loading') return `Загружается... ${s.progress}%`
  if (s.status === 'error') return 'Ошибка загрузки'
  return `Готово · ${s.kbps} КБ/с · ${s.ms}мс`
}

export default function UserTab() {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const preload = useSequentialPreload(files)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setError('')
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
          {files.map((f, idx) => {
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
