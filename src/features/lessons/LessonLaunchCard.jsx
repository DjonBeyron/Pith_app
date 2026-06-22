import { useState, useEffect } from 'react'
import { loadScript } from '../../shared/lib/lessonsApi.js'
import { getFilesByIds } from '../../shared/lib/filesApi.js'
import { usePlayerPreload } from '../player/usePlayerPreload.js'

const WARMUP_TARGET = 5
const MEDIA_TYPES = new Set(['audio', 'voice_record', 'video', 'circle', 'photo', 'sticker', 'photo_choice'])

function extractFileIds(nodes) {
  const single = nodes.map(n => n.typeData?.[n.type]?.file_id).filter(Boolean)
  const photos  = nodes
    .filter(n => n.type === 'photo_choice')
    .flatMap(n => (n.typeData?.photo_choice?.photos ?? []).map(p => p.fileId).filter(Boolean))
  return [...new Set([...single, ...photos])]
}

function countDownloads(nodes) {
  return nodes.reduce((acc, n) => {
    if (!MEDIA_TYPES.has(n.type)) return acc
    if (n.type === 'photo_choice') {
      return acc + (n.typeData?.photo_choice?.photos ?? []).filter(p => p.fileId).length
    }
    return n.typeData?.[n.type]?.file_id ? acc + 1 : acc
  }, 0)
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
  const { nodes, files, title, teacherName, teacherLogo, teacherLogoCrop } = lessonData

  const { blobMap, releaseBlobs } = usePlayerPreload(
    nodes, files, [], { initialLookahead: WARMUP_TARGET }
  )

  const total    = Math.min(WARMUP_TARGET, countDownloads(nodes))
  const ready    = Object.keys(blobMap).length
  const clipped  = Math.min(ready, total)
  const pct      = total > 0 ? Math.round(clipped / total * 100) : 100
  const canStart = clipped >= total || total === 0

  function handleStart() {
    releaseBlobs()
    onStart({ nodes, files, blobMap, title, teacherName, teacherLogo, teacherLogoCrop })
  }

  return (
    <>
      <h2 style={{ margin: 0, color: '#fff', fontSize: 18, fontWeight: 600 }}>{title}</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{
          height: 6, borderRadius: 3,
          background: '#333', overflow: 'hidden',
        }}>
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
            : `Подготовка: ${clipped} / ${total} файлов`}
        </span>
      </div>

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
