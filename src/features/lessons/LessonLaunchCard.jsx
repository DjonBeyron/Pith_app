import { useState, useEffect, useRef } from 'react'
import { loadScript } from '../../shared/lib/lessonsApi.js'
import { getFilesByIds } from '../../shared/lib/filesApi.js'
import { usePlayerPreload } from '../player/usePlayerPreload.js'
import { preloadSounds, unlockAudio } from '../../shared/lib/sounds.js'

const WARMUP_TARGET = 5

function extractFileIds(nodes) {
  const single = nodes.map(n => n.typeData?.[n.type]?.file_id).filter(Boolean)
  const photos  = nodes
    .filter(n => n.type === 'photo_choice')
    .flatMap(n => (n.typeData?.photo_choice?.photos ?? []).map(p => p.fileId).filter(Boolean))
  return [...new Set([...single, ...photos])]
}

// Detect slow/low-memory devices to use a smaller in-memory buffer.
// Falls back to false on browsers that don't expose these APIs (e.g. iOS Safari).
function isWeakDevice() {
  const mem  = navigator.deviceMemory          // GB, Chrome/Android only
  const cpu  = navigator.hardwareConcurrency
  const conn = navigator.connection?.effectiveType  // '2g' | 'slow-3g' | '3g' | '4g'
  if (mem  && mem  < 2)                        return true
  if (cpu  && cpu  < 4)                        return true
  if (conn && (conn === '2g' || conn === 'slow-3g')) return true
  return false
}

export default function LessonLaunchCard({ lessonId, onStart, onClose }) {
  const [lessonData, setLessonData] = useState(null)
  const [error, setError]           = useState(null)

  useEffect(() => {
    loadScript(lessonId)
      .then(async raw => {
        const nodes = raw?.script?.nodes ?? []
        const ids   = extractFileIds(nodes)
        const files = ids.length ? await getFilesByIds(ids) : []
        setLessonData({
          nodes,
          files,
          title:           raw?.title ?? '',
          teacherName:     raw?.script?.teacherName ?? '',
          teacherLogo:     raw?.script?.teacherLogo ?? null,
          teacherLogoCrop: raw?.script?.teacherLogoCrop ?? null,
          videoAutoSound:  raw?.script?.videoAutoSound ?? false,
        })
      })
      .catch(() => setError('Не удалось загрузить урок'))
  }, [lessonId]) // eslint-disable-line

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#1a1a1a', borderRadius: 16, padding: 32,
        minWidth: 300, maxWidth: 420, width: '90%',
        display: 'flex', flexDirection: 'column', gap: 20,
        position: 'relative',
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 12, right: 16,
            background: 'none', border: 'none', color: '#888',
            fontSize: 20, cursor: 'pointer', lineHeight: 1,
          }}
        >×</button>

        {error && <p style={{ color: '#ff7070', margin: 0 }}>{error}</p>}

        {!error && !lessonData && (
          <p style={{ color: '#888', margin: 0, textAlign: 'center' }}>Загрузка урока...</p>
        )}

        {lessonData && (
          <LaunchPreloader lessonData={lessonData} onStart={onStart} />
        )}
      </div>
    </div>
  )
}

function LaunchPreloader({ lessonData, onStart }) {
  const { nodes, files, title, teacherName, teacherLogo, teacherLogoCrop, videoAutoSound } = lessonData

  // Weak device → smaller in-memory buffer during lesson (2 past + 2 ahead vs 5 + 3)
  const weak       = isWeakDevice()
  const bufferSize = weak ? 3 : 5

  const { blobMap, readyNodeIds, warmupNodeIds, initialized, debugItems, releaseBlobs } = usePlayerPreload(
    nodes, files, [], { initialLookahead: WARMUP_TARGET, bufferSize }
  )

  // Start decoding UI sounds while lesson files are loading — no gesture needed for decode.
  // By the time the user taps "Start", AudioBuffers are ready and AudioContext just needs resume().
  useEffect(() => { preloadSounds() }, [])

  // Preload teacher logo separately (not part of the node graph)
  const logoBlobRef             = useRef(null) // holds blob URL so cleanup can revoke it
  const [logoBlobUrl, setLogoBlobUrl] = useState(null)
  const [logoReady,   setLogoReady]   = useState(!teacherLogo) // no logo → already "ready"

  useEffect(() => {
    if (!teacherLogo) { setLogoReady(true); return }
    let cancelled = false
    const controller = new AbortController()
    fetch(teacherLogo, { signal: controller.signal })
      .then(r => r.blob())
      .then(blob => {
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        logoBlobRef.current = url
        setLogoBlobUrl(url)
        setLogoReady(true)
      })
      .catch(() => { if (!cancelled) setLogoReady(true) }) // skip logo on error, don't block
    return () => {
      cancelled = true
      controller.abort()
      // revoke only if not yet handed off to the player (releaseLogo clears the ref)
      if (logoBlobRef.current) { URL.revokeObjectURL(logoBlobRef.current); logoBlobRef.current = null }
    }
  }, [teacherLogo]) // eslint-disable-line react-hooks/exhaustive-deps

  // Progress is counted in NODES (BFS order, same as preloader) + 1 slot for logo if present.
  // initialized=false until the hook has built its queue — prevents false "ready" flash.
  const nodeTotal   = warmupNodeIds.length
  const nodeReady   = warmupNodeIds.filter(id => readyNodeIds.has(id)).length
  const total       = nodeTotal + (teacherLogo ? 1 : 0)
  const readyCount  = nodeReady  + (logoReady   ? (teacherLogo ? 1 : 0) : 0)
  const pct         = total > 0 ? Math.round(readyCount / total * 100) : 0
  const canStart    = initialized && logoReady && (nodeReady >= nodeTotal || nodeTotal === 0)

  function handleStart() {
    // Preload + unlock in the same gesture context so iOS Safari decodes audio immediately.
    // preloadSounds() creates Audio objects; unlockAudio() does play+pause on them.
    // Both must run here (not in useEffect) — iOS only allows audio decode within a gesture.
    preloadSounds()
    unlockAudio()
    releaseBlobs()
    // Transfer logo blob ownership to player — clear ref so cleanup won't revoke it
    const logoForPlayer = logoBlobRef.current ?? teacherLogo
    logoBlobRef.current = null
    onStart({ nodes, files, blobMap, title, teacherName, teacherLogo: logoForPlayer, teacherLogoCrop, videoAutoSound })
  }

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

  const STATUS_COLOR = { start: '#b6fe3b', ready: '#4caf50', error: '#ff5252' }

  return (
    <>
      <h2 style={{ margin: 0, color: '#fff', fontSize: 18, fontWeight: 600 }}>{title}</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ height: 6, borderRadius: 3, background: '#333', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 3,
            width: pct + '%',
            background: canStart ? '#4caf50' : '#b6fe3b',
            transition: 'width 0.3s ease',
          }} />
        </div>
        <span style={{ color: '#888', fontSize: 12 }}>
          {canStart
            ? 'Урок готов к запуску'
            : `Подготовка: ${readyCount} / ${total} нод`}
        </span>
        {weak && (
          <span style={{ color: '#666', fontSize: 11 }}>
            Режим экономии памяти (буфер {bufferSize})
          </span>
        )}
      </div>

      {/* Debug: per-file download status */}
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

      <button
        onClick={handleStart}
        disabled={!canStart}
        style={{
          padding: '14px 0', borderRadius: 12, border: 'none',
          fontSize: 16, fontWeight: 600, cursor: canStart ? 'pointer' : 'default',
          background: canStart ? '#4caf50' : '#333',
          color: canStart ? '#fff' : '#666',
          transition: 'background 0.3s ease, color 0.3s ease',
        }}
      >
        {canStart ? '▶ Начать урок' : 'Загрузка...'}
      </button>
    </>
  )
}
