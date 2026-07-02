import { useEffect, useRef, useState } from 'react'
import { uploadToR2, deleteFromR2 } from '../../shared/lib/r2.js'
import { listFiles, insertFile, deleteFileRow, formatBytes } from '../../shared/lib/filesApi.js'
import { isDebugOn, setDebug, dbg, downloadLog } from '../../shared/lib/debug.js'
import { useAdmin } from '../../app/AdminContext.jsx'
import AuthTab from '../auth/AuthTab.jsx'

function statusLabel(status) {
  switch (status) {
    case 'synced': return '☁ на сервере'
    case 'pending-upload': return '⬆ ожидает загрузки'
    case 'pending-delete': return '🗑 ожидает удаления'
    case 'uploading': return '⟳ загружается...'
    case 'deleting': return '⟳ удаляется...'
    case 'error': return '✗ ошибка'
    default: return status
  }
}

function AdminPanel() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [debugOn, setDebugOnState] = useState(isDebugOn())
  const fileInputRef = useRef(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const data = await listFiles()
      dbg('[admin] loaded files from server:', data.length)
      setRows(data.map(f => ({
        id: f.id,
        dbId: f.id,
        file: null,
        fileName: f.file_name,
        sizeBytes: f.size_bytes,
        contentType: f.content_type,
        status: 'synced',
        uploadedAt: f.uploaded_at,
        r2Url: f.r2_url,
      })))
    } catch (e) {
      console.error('[admin] load failed', e)
    } finally {
      setLoading(false)
    }
  }

  function onPickFiles(e) {
    const files = Array.from(e.target.files || [])
    const newRows = files.map(file => ({
      id: crypto.randomUUID(),
      dbId: null,
      file,
      fileName: file.name,
      sizeBytes: file.size,
      contentType: file.type || 'application/octet-stream',
      status: 'pending-upload',
      uploadedAt: null,
      r2Url: null,
    }))
    setRows(prev => [...newRows, ...prev])
    e.target.value = ''
  }

  function markDelete(id) {
    setRows(prev => prev
      .map(r => {
        if (r.id !== id) return r
        if (r.status === 'pending-upload') return null
        if (r.status === 'synced') return { ...r, status: 'pending-delete' }
        if (r.status === 'pending-delete') return { ...r, status: 'synced' }
        return r
      })
      .filter(Boolean))
  }

  // Mobile networks drop connections mid-upload — keep the picked file/target around so the
  // user can just retry instead of re-picking the file from scratch.
  function retryRow(id) {
    setRows(prev => prev.map(r => {
      if (r.id !== id || r.status !== 'error') return r
      return { ...r, status: r.file ? 'pending-upload' : 'pending-delete' }
    }))
  }

  function removeErrorRow(id) {
    setRows(prev => prev.filter(r => r.id !== id))
  }

  function cancelDeleteError(id) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, status: 'synced' } : r)))
  }

  function toggleDebug() {
    const next = !debugOn
    setDebug(next)
    setDebugOnState(next)
  }

  async function runSync() {
    setSyncing(true)
    setSyncMsg('')
    const t0 = performance.now()
    dbg('[sync] start', { rows: rows.length })

    let uploaded = 0, deleted = 0, failed = 0
    const next = [...rows]

    for (let i = 0; i < next.length; i++) {
      const row = next[i]

      if (row.status === 'pending-upload') {
        next[i] = { ...row, status: 'uploading' }
        setRows([...next])
        const tStart = performance.now()
        try {
          dbg('[sync] uploading', row.fileName, formatBytes(row.sizeBytes))
          const r2Url = await uploadToR2(row.file)
          const dbRow = await insertFile({
            fileName: row.fileName,
            sizeBytes: row.sizeBytes,
            contentType: row.contentType,
            r2Url,
          })
          dbg('[sync] uploaded', row.fileName, `${Math.round(performance.now() - tStart)}ms`)
          next[i] = {
            ...row,
            status: 'synced',
            dbId: dbRow.id,
            r2Url: dbRow.r2_url,
            uploadedAt: dbRow.uploaded_at,
            file: null,
          }
          uploaded++
        } catch (e) {
          console.error('[sync] upload failed', row.fileName, e)
          next[i] = { ...row, status: 'error' }
          failed++
        }
        setRows([...next])
      } else if (row.status === 'pending-delete') {
        next[i] = { ...row, status: 'deleting' }
        setRows([...next])
        try {
          dbg('[sync] deleting', row.fileName)
          await deleteFromR2(row.r2Url)
          await deleteFileRow(row.dbId)
          dbg('[sync] deleted', row.fileName)
          next[i] = null
          deleted++
        } catch (e) {
          console.error('[sync] delete failed', row.fileName, e)
          next[i] = { ...row, status: 'error' }
          failed++
        }
        setRows(next.filter(Boolean))
      }
    }

    const finalRows = next.filter(Boolean)
    setRows(finalRows)
    dbg('[sync] done', `${Math.round(performance.now() - t0)}ms`, { uploaded, deleted, failed })
    setSyncMsg(failed
      ? `✗ Готово с ошибками: ${uploaded} загружено, ${deleted} удалено, ${failed} ошибок`
      : `✓ Готово: ${uploaded} загружено, ${deleted} удалено`)
    setSyncing(false)
  }

  const hasPending = rows.some(r => r.status === 'pending-upload' || r.status === 'pending-delete')

  return (
    <div className="adminPanel">
      <div className="toolbar">
        <button onClick={() => fileInputRef.current?.click()}>+ Добавить файл</button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,audio/*"
          multiple
          style={{ display: 'none' }}
          onChange={onPickFiles}
        />
        <button onClick={runSync} disabled={syncing || !hasPending} className="primaryBtn">
          {syncing ? 'Синхронизация...' : 'Синхронизировать с сервером'}
        </button>
        <button onClick={toggleDebug} className={debugOn ? 'debugBtnOn' : 'debugBtn'}>
          {debugOn ? '🐞 Дебаг включён' : 'Активировать дебаг'}
        </button>
        <button onClick={downloadLog}>⬇ Скачать лог</button>
        <button onClick={load} disabled={loading || syncing}>Обновить список</button>
      </div>

      {syncMsg && <div className="syncMsg">{syncMsg}</div>}

      {loading ? (
        <div>Загрузка...</div>
      ) : (
        <table className="filesTable">
          <thead>
            <tr>
              <th>Файл</th>
              <th>Вес</th>
              <th>Статус</th>
              <th>Загружен</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id}>
                <td>{row.fileName}</td>
                <td>{formatBytes(row.sizeBytes)}</td>
                <td>{statusLabel(row.status)}</td>
                <td>{row.uploadedAt ? new Date(row.uploadedAt).toLocaleString('ru-RU') : '—'}</td>
                <td>
                  {row.status === 'error' && row.file && (
                    <>
                      <button onClick={() => retryRow(row.id)}>Повторить</button>{' '}
                      <button onClick={() => removeErrorRow(row.id)}>Убрать</button>
                    </>
                  )}
                  {row.status === 'error' && !row.file && (
                    <>
                      <button onClick={() => retryRow(row.id)}>Повторить</button>{' '}
                      <button onClick={() => cancelDeleteError(row.id)}>Отменить</button>
                    </>
                  )}
                  {(row.status === 'synced' || row.status === 'pending-upload' || row.status === 'pending-delete') && (
                    <button onClick={() => markDelete(row.id)}>
                      {row.status === 'pending-delete' ? 'Отменить' : 'Удалить'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5}>Файлов нет</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default function AdminTab() {
  const { user, isAdmin, loading } = useAdmin()

  if (loading) return <div className="adminPanel"><div>Загрузка...</div></div>

  // Не залогинен — показываем форму входа прямо здесь.
  if (!user) {
    return (
      <div className="adminPanel">
        <p className="authHint">Войдите в аккаунт администратора, чтобы управлять файлами.</p>
        <AuthTab />
      </div>
    )
  }

  // Залогинен, но без прав — запись в БД всё равно закрыта политиками RLS.
  if (!isAdmin) {
    return (
      <div className="adminPanel">
        <p className="authHint">У этого аккаунта нет прав администратора.</p>
      </div>
    )
  }

  return <AdminPanel />
}
