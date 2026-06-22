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
import { usePlayerPreload, CHAT_BUFFER_SIZE } from './usePlayerPreload.js'
import { getFilesByIds } from '../../shared/lib/filesApi.js'
import { pLog } from '../../shared/lib/debug.js'

const OVERLAY_TYPES = new Set(['audio', 'voice_record', 'video', 'circle', 'photo', 'sticker'])
const EVICT_TYPES   = new Set(['audio', 'voice_record', 'video', 'circle'])

function overlayStatusColor(status) {
  if (status === 'ready')   return '#7dff8a'
  if (status === 'evicted') return '#888'
  if (status === 'loading') return '#ffe066'
  return '#444'
}

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

  const { blobMap, debugItems, addMsgTs, evictLog } =
    usePlayerPreload(nodes, files, visibleNodes, { initialBlobMap })

  const openTimeRef    = useRef(Date.now())
  const prevVisibleRef = useRef([])
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    pLog(`Player init: blobs=${Object.keys(initialBlobMap ?? {}).length} files=${files.length}`)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - openTimeRef.current) / 1000)), 1000)
    return () => clearInterval(id)
  }, [])

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

  // Build overlay rows: one per media node, showing buffer/eviction state
  const overlayRows = useMemo(() => {
    const visIds = new Set(visibleNodes.map(n => n.id))
    return [...nodes]
      .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
      .filter(n => OVERLAY_TYPES.has(n.type))
      .map(n => {
        const fileId = n.typeData?.[n.type]?.file_id
        if (!fileId) return null
        const entry = blobMap[fileId]
        const di    = debugItems.find(d => d.seq === n.seq)
        let status = 'queued'
        if (entry?.blobUrl)   status = 'ready'
        else if (entry?.evicted) status = 'evicted'
        else if (di?.status === 'start') status = 'loading'
        return {
          seq: n.seq, type: n.type, fileId, status,
          sizeKb: di?.sizeKb ?? null,
          revealed: visIds.has(n.id),
          evictable: EVICT_TYPES.has(n.type),
        }
      })
      .filter(Boolean)
  }, [nodes, blobMap, visibleNodes, debugItems])

  const revealedInMem = overlayRows.filter(r => r.status === 'ready' && r.evictable && r.revealed).length
  const totalInMem    = overlayRows.filter(r => r.status === 'ready' && r.evictable).length
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

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

      {/* Buffer debug overlay — visible in dev mode only */}
      {import.meta.env.DEV && overlayRows.length > 0 && (
        <div style={{
          position: 'fixed', top: 24, bottom: 8, right: 6,
          width: 170, fontSize: 9, zIndex: 200,
          fontFamily: 'monospace', lineHeight: 1.7,
          background: 'rgba(0,0,0,0.78)', borderRadius: 6, padding: '5px 7px',
          display: 'flex', flexDirection: 'column', gap: 0,
          pointerEvents: 'none',
        }}>
          {/* Header */}
          <div style={{ color: '#ffe066', fontWeight: 'bold', marginBottom: 3, flexShrink: 0 }}>
            {`${mm}:${ss}  буфер: ${revealedInMem}/${CHAT_BUFFER_SIZE}`}
            {totalInMem > revealedInMem && (
              <span style={{ color: '#56a0d3' }}>{` +${totalInMem - revealedInMem}↑`}</span>
            )}
          </div>

          {/* Per-file rows */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {overlayRows.map(row => (
              <div key={row.fileId} style={{
                color: overlayStatusColor(row.status),
                opacity: row.revealed ? 1 : 0.45,
              }}>
                {row.revealed ? '▶' : '·'}
                {` #${row.seq} ${row.type.slice(0, 3)}`}
                {row.status === 'ready'   && row.sizeKb  && ` ${row.sizeKb}KB`}
                {row.status === 'evicted' && ' [out]'}
                {row.status === 'loading' && ' …'}
              </div>
            ))}

            {/* Eviction log */}
            {evictLog.length > 0 && (
              <>
                <div style={{ color: '#555', margin: '4px 0 2px' }}>── вытеснения ──</div>
                {evictLog.slice(-6).map((e, i) => (
                  <div key={i} style={{ color: '#ff9944' }}>
                    {`${e.ts} #${e.seq} ${e.type.slice(0, 3)} OUT`}
                  </div>
                ))}
              </>
            )}
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
