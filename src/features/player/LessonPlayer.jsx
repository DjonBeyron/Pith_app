import { useState, useEffect, useMemo, useRef } from 'react'
import { APP_VERSION } from '../../shared/lib/version.js'
import PlayerTopBar from './PlayerTopBar.jsx'
import PlayerFeed from './PlayerFeed.jsx'
import PlayerMessage from './PlayerMessage.jsx'
import ChooseWordPanel      from './panels/choose-word/ChooseWordPanel.jsx'
import PhraseAssemblyPanel from './panels/phrase-assembly/PhraseAssemblyPanel.jsx'
import PinMessageBanner    from './panels/PinMessageBanner.jsx'
import PhotoChoicePanel    from './panels/photo-choice/PhotoChoicePanel.jsx'
import { useGraphPlayer }  from './useGraphPlayer.js'
import { usePlayerPreload } from './usePlayerPreload.js'
import { getFilesByIds } from '../../shared/lib/filesApi.js'
import { pLog } from '../../shared/lib/debug.js'

export default function LessonPlayer({
  nodes = [], files: propFiles = [], lessonTitle = '',
  teacherName, teacherLogo, teacherLogoCrop,
  initialBlobMap = null,
  onClose,
}) {
  const [files, setFiles] = useState(propFiles)
  const { visibleNodes, onNodeDone } = useGraphPlayer(nodes)

  useEffect(() => {
    const singleIds = nodes.map(n => n.typeData?.[n.type]?.file_id).filter(Boolean)
    const photoIds  = nodes
      .filter(n => n.type === 'photo_choice')
      .flatMap(n => (n.typeData?.photo_choice?.photos ?? []).map(p => p.fileId).filter(Boolean))
    const allIds = [...new Set([...singleIds, ...photoIds])]
    const missing = allIds.filter(id => !propFiles.some(f => f.id === id))
    if (!missing.length) { setFiles(propFiles); return }
    getFilesByIds(missing)
      .then(fetched => setFiles([...propFiles, ...fetched]))
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { blobMap, debugItems, addMsgTs } = usePlayerPreload(nodes, files, visibleNodes, { initialBlobMap })

  const openTimeRef    = useRef(Date.now())
  const prevVisibleRef = useRef([])
  const debugScrollRef = useRef(null)
  const [elapsed, setElapsed] = useState(0)

  // Log what arrived from card
  useEffect(() => {
    const blobKeys = Object.keys(initialBlobMap ?? {})
    pLog(`Player init: blobs=${blobKeys.length} files=${files.length}`)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Build preloaded rows for overlay: one row per preloaded file with seq + type
  const preloadedRows = useMemo(() => {
    if (!initialBlobMap) return []
    const blobKeys = new Set(Object.keys(initialBlobMap))
    const rows = []
    for (const n of nodes) {
      const MEDIA = new Set(['audio','voice_record','video','circle','photo','sticker','photo_choice'])
      if (!MEDIA.has(n.type)) continue
      if (n.type === 'photo_choice') {
        const photos = n.typeData?.photo_choice?.photos ?? []
        photos.forEach(ph => {
          if (ph.fileId && blobKeys.has(ph.fileId)) rows.push({ seq: n.seq, type: 'photo_choice' })
        })
      } else {
        const fid = n.typeData?.[n.type]?.file_id
        if (fid && blobKeys.has(fid)) rows.push({ seq: n.seq, type: n.type })
      }
    }
    return rows
  }, [initialBlobMap, nodes])

  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - openTimeRef.current) / 1000)), 1000)
    return () => clearInterval(id)
  }, [])

  // Auto-scroll debug overlay to bottom when new items arrive
  useEffect(() => {
    if (debugScrollRef.current) {
      debugScrollRef.current.scrollTop = debugScrollRef.current.scrollHeight
    }
  }, [debugItems])

  // Record when each node first appears in chat
  useEffect(() => {
    const prevIds = new Set(prevVisibleRef.current.map(n => n.id))
    const newNodes = visibleNodes.filter(n => !prevIds.has(n.id))
    if (newNodes.length) {
      const t = `+${((Date.now() - openTimeRef.current) / 1000).toFixed(1)}`
      newNodes.forEach(n => addMsgTs(n.seq, t))
    }
    prevVisibleRef.current = visibleNodes
  }, [visibleNodes]) // eslint-disable-line react-hooks/exhaustive-deps

  // Enrich every file with its preloaded blobUrl so all modules get it via lessonFiles
  const filesWithBlobs = useMemo(
    () => files.map(f => {
      const entry = blobMap[f.id]
      if (!entry) return f
      return { ...f, blobUrl: entry.blobUrl, posterUrl: entry.posterUrl ?? null }
    }),
    [files, blobMap]
  )

  // ── Panels ───────────────────────────────────────────────────────────────
  const [photoChoiceStates, setPhotoChoiceStates] = useState({})
  const [wordChoiceStates, setWordChoiceStates]   = useState({})
  const [phraseStates, setPhraseStates]           = useState({})

  function handlePhotoPick(nodeId, idx, isCorrect) {
    const result = isCorrect ? 'photo_correct' : 'photo_wrong'
setPhotoChoiceStates(prev => ({ ...prev, [nodeId]: { selected: idx, result: isCorrect ? 'correct' : 'wrong' } }))
    onNodeDone(nodeId, result)
  }

  function handleWordAnswer(nodeId, text, result) {
    setWordChoiceStates(prev => ({ ...prev, [nodeId]: { text, result } }))
  }

  function handlePhraseAnswer(nodeId, text, result) {
    setPhraseStates(prev => {
      const arr = prev[nodeId] ?? []
      if (result === 'wrong' && arr.some(b => b.result === 'wrong')) return prev
      return { ...prev, [nodeId]: [...arr, { text, result }] }
    })
  }

  const [pinVisible, setPinVisible]       = useState(true)
  const [wcPanelHeight, setWcPanelHeight] = useState(0)
  const [paPanelHeight, setPaPanelHeight] = useState(0)
  const [pcPanelHeight, setPcPanelHeight] = useState(0)

  const lastOf = (type) => [...visibleNodes].reverse().find(n => n.type === type) ?? null
  const wcNode = lastOf('word_choice')
  const paNode = lastOf('phrase_assembly')
  const pmNode = lastOf('pin_message')
  const pcNode = lastOf('photo_choice')

  return (
    <>
      <div className="lessonPlayer">
        <PlayerTopBar
          title={lessonTitle}
          onClose={onClose}
          teacherName={teacherName}
          teacherLogo={teacherLogo}
          teacherLogoCrop={teacherLogoCrop}
        />
        {pmNode && pinVisible && (
          <PinMessageBanner
            content={pmNode.typeData?.pin_message?.content ?? ''}
            onUnpin={() => setPinVisible(false)}
          />
        )}
        <PlayerFeed>
          {visibleNodes.map(node => {
            const fileId = node.typeData?.[node.type]?.file_id ?? null
            const file   = filesWithBlobs.find(f => f.id === fileId) ?? null
            return (
              <PlayerMessage
                key={node.id}
                node={node}
                file={file}
                lessonFiles={filesWithBlobs}
                teacherName={teacherName}
                photoChoiceState={photoChoiceStates[node.id] ?? null}
                wordChoiceState={wordChoiceStates[node.id] ?? null}
                phraseState={phraseStates[node.id] ?? null}
                bottomOffset={wcPanelHeight || paPanelHeight || pcPanelHeight}
                onDone={() => onNodeDone(node.id)}
              />
            )
          })}
          {visibleNodes.length === 0 && (
            <p className="playerEmpty">Нод нет — добавь ноды в редакторе</p>
          )}
        </PlayerFeed>
        {wcNode && (
          <ChooseWordPanel
            node={wcNode}
            onDone={(result) => { setWcPanelHeight(0); onNodeDone(wcNode.id, result) }}
            onAnswered={(text, result) => handleWordAnswer(wcNode.id, text, result)}
            onHeightChange={setWcPanelHeight}
          />
        )}
        {paNode && (
          <PhraseAssemblyPanel
            node={paNode}
            onDone={(result) => { setPaPanelHeight(0); onNodeDone(paNode.id, result) }}
            onAnswered={(text, result) => handlePhraseAnswer(paNode.id, text, result)}
            onHeightChange={setPaPanelHeight}
          />
        )}
        {pcNode && !photoChoiceStates[pcNode.id] && (
          <PhotoChoicePanel
            node={pcNode}
            lessonFiles={filesWithBlobs}
            onPick={(idx, isCorrect) => handlePhotoPick(pcNode.id, idx, isCorrect)}
            onHeightChange={setPcPanelHeight}
          />
        )}
      </div>
      {/* Preload debug overlay — set DEBUG_OVERLAY=true to enable */}
      {false && (debugItems.length > 0 || initialBlobMap) && (
        <div style={{
          position: 'fixed', top: 24, bottom: 8, left: 6,
          fontSize: 9, pointerEvents: 'auto', zIndex: 200,
          fontFamily: 'monospace', lineHeight: 1.6,
          maxWidth: 260, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          background: 'rgba(0,0,0,0.72)', borderRadius: 6, padding: '4px 6px',
        }}>
          {/* Sticky header */}
          <div style={{ color: '#ffe066', marginBottom: 3, fontWeight: 'bold', flexShrink: 0 }}>
            {`урок: ${Math.floor(elapsed / 60).toString().padStart(2,'0')}:${(elapsed % 60).toString().padStart(2,'0')}`}
          </div>
          {/* Scrollable list */}
          <div ref={debugScrollRef} style={{ overflowY: 'auto', flex: 1 }}>
            {preloadedRows.map((row, i) => (
              <div key={`pre_${i}`} style={{ marginBottom: 3 }}>
                <div style={{ color: '#56a0d3' }}>
                  {`noda: ${row.seq} | pre-loaded | ${row.type}`}
                </div>
              </div>
            ))}
            {debugItems.map(item => (
              <div key={item.key} style={{ marginBottom: 3 }}>
                <div style={{ color: '#888' }}>
                  {`noda: ${item.seq} | download: ${item.startTs}s | ${item.type}`}
                </div>
                {item.readyTs && (
                  <div style={{ color: item.status === 'error' ? '#ff7070' : '#7dff8a' }}>
                    {item.status === 'error'
                      ? `noda: ${item.seq} | download end: ${item.readyTs}s | ${item.error}`
                      : `noda: ${item.seq} | download end: ${item.readyTs}s | ${item.sizeKb}KB`}
                  </div>
                )}
                {item.readyTs && item.msgTs && (
                  <div style={{ color: '#ffe066' }}>
                    {`noda: ${item.seq} | ${item.readyTs}s <> chat: ${item.msgTs}s`}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Версия для отслеживания деплоя — fixed, вне потока, pointer-events:none */}
      <div style={{
        position: 'fixed', top: 4, left: '50%', transform: 'translateX(-50%)',
        fontSize: 9, color: 'rgba(255,255,255,0.2)', pointerEvents: 'none',
        zIndex: 9999, userSelect: 'none', whiteSpace: 'nowrap',
      }}>{APP_VERSION}: {(() => { const d = new Date(__BUILD_TIME__); return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}.${String(d.getMinutes()).padStart(2,'0')}` })()}</div>
    </>
  )
}
