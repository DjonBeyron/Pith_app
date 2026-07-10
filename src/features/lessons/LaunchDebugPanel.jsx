// Админская часть окна старта урока: постатусный список скачиваемых файлов
// и кнопка «Скачать лог загрузки». Обычный пользователь этого не видит.
const STATUS_COLOR = { start: '#b6fe3b', ready: '#4caf50', error: '#ff5252' }

export default function LaunchDebugPanel({ weak, bufferSize, warmupNodeIds, files, debugItems }) {
  function downloadDebugLog() {
    const payload = {
      ts: new Date().toISOString(),
      ua: navigator.userAgent,
      device: {
        memory: navigator.deviceMemory ?? 'n/a',
        cpu: navigator.hardwareConcurrency ?? 'n/a',
        conn: navigator.connection?.effectiveType ?? 'n/a',
      },
      weak,
      bufferSize,
      warmupNodeIds,
      files: files.map(f => ({ id: f.id, name: f.file_name, hasUrl: !!f.r2Url })),
      downloads: debugItems.map(d => ({
        seq: d.seq, type: d.type,
        status: d.status, httpStatus: d.httpStatus,
        error: d.error, sizeKb: d.sizeKb,
        startTs: d.startTs, readyTs: d.readyTs,
        url: d.url,
      })),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `preload-debug-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <>
      {weak && (
        <span style={{ color: '#666', fontSize: 11 }}>
          Режим экономии памяти (буфер {bufferSize})
        </span>
      )}

      {debugItems.length > 0 && (
        <div style={{
          background: '#111', borderRadius: 8, padding: '8px 10px',
          display: 'flex', flexDirection: 'column', gap: 3,
          maxHeight: 160, overflowY: 'auto', fontSize: 11,
        }}>
          {debugItems.map(item => (
            <div key={item.key} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: STATUS_COLOR[item.status] ?? '#555',
              }} />
              <span style={{ color: '#aaa', flexShrink: 0 }}>#{item.seq} {item.type}</span>
              <span style={{ color: STATUS_COLOR[item.status] ?? '#888', fontWeight: 600 }}>
                {item.status === 'ready'
                  ? `✓ ${item.sizeKb} KB`
                  : item.status === 'error'
                  ? `✗ ${item.error}`
                  : item.progress > 0
                  ? `↓ ${item.progress}%`
                  : `↓ соединение...`}
              </span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={downloadDebugLog}
        style={{
          padding: '8px 0', borderRadius: 8, border: '1px solid #444',
          fontSize: 12, cursor: 'pointer',
          background: 'transparent', color: '#888',
        }}
      >
        Скачать лог загрузки
      </button>
    </>
  )
}
