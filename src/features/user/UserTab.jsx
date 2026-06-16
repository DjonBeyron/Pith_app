import { useEffect, useState } from 'react'
import { listFiles, formatBytes } from '../../shared/lib/filesApi.js'
import { dbg } from '../../shared/lib/debug.js'

function renderMedia(f) {
  const type = f.content_type || ''
  if (type.startsWith('image/')) return <img src={f.r2_url} alt={f.file_name} />
  if (type.startsWith('video/')) return <video src={f.r2_url} controls />
  if (type.startsWith('audio/')) return <audio src={f.r2_url} controls />
  return <div className="unknownType">Неизвестный тип файла</div>
}

export default function UserTab() {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
      setFiles(data)
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
          {files.map(f => (
            <div className="fileCard" key={f.id}>
              <div className="fileCardMedia">{renderMedia(f)}</div>
              <div className="fileCardName">{f.file_name}</div>
              <div className="fileCardMeta">{formatBytes(f.size_bytes)}</div>
            </div>
          ))}
          {files.length === 0 && <div>На сервере пока нет файлов</div>}
        </div>
      )}
    </div>
  )
}
