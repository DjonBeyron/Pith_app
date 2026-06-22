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

export default function LessonPlayer({
  nodes = [], files: propFiles = [], lessonTitle = '',
  teacherName, teacherLogo, teacherLogoCrop,
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

  const { blobMap, preloadLines } = usePlayerPreload(nodes, files, visibleNodes)

  const openTimeRef = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - openTimeRef.current) / 1000)), 1000)
    return () => clearInterval(id)
  }, [])

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
      {/* Preload debug overlay — fixed, doesn't affect flex */}
      {preloadLines.length > 0 && (
        <div style={{
          position: 'fixed', top: 24, bottom: 8, left: 6,
          fontSize: 9, color: 'rgba(255,255,255,0.45)',
          pointerEvents: 'none', zIndex: 200,
          fontFamily: 'monospace', lineHeight: 1.5,
          maxWidth: 240, overflow: 'hidden',
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        }}>
          <div style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
            {`урок: ${Math.floor(elapsed / 60).toString().padStart(2,'0')}:${(elapsed % 60).toString().padStart(2,'0')}`}
          </div>
          {preloadLines.map((l, i) => <div key={i}>{l}</div>)}
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
