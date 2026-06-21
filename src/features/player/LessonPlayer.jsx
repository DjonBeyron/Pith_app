import { useState, useEffect } from 'react'
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
import { pLog }          from '../../shared/lib/debug.js'

export default function LessonPlayer({
  nodes = [], files: propFiles = [], lessonTitle = '',
  teacherName, teacherLogo, teacherLogoCrop,
  onClose,
}) {
  const [files, setFiles] = useState(propFiles)
  const { visibleNodes, onNodeDone } = useGraphPlayer(nodes)

  useEffect(() => {
    const allIds = [...new Set(nodes.map(n => n.typeData?.[n.type]?.file_id).filter(Boolean))]
    const missing = allIds.filter(id => !propFiles.some(f => f.id === id))
    pLog('LessonPlayer mount: allFileIds=', JSON.stringify(allIds), 'missing=', JSON.stringify(missing))
    if (!missing.length) { setFiles(propFiles); return }
    getFilesByIds(missing).then(fetched => {
      pLog('LessonPlayer fetched from server:', fetched.map(f => f.id + ' r2=' + (f.r2Url ?? 'null')).join(' | ') || 'none')
      setFiles([...propFiles, ...fetched])
    }).catch(e => pLog('LessonPlayer getFilesByIds ERROR:', e.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const blobMap = usePlayerPreload(nodes, files, visibleNodes)

  // ── Panels ───────────────────────────────────────────────────────────────
  const [photoChoiceStates, setPhotoChoiceStates] = useState({})

  function handlePhotoPick(nodeId, idx, isCorrect) {
    setPhotoChoiceStates(prev => ({ ...prev, [nodeId]: { selected: idx, result: isCorrect ? 'correct' : 'wrong' } }))
    onNodeDone(nodeId)
  }

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
        {pmNode && <PinMessageBanner content={pmNode.typeData?.pin_message?.content ?? ''} />}
        <PlayerFeed>
          {visibleNodes.map(node => {
            const fileId = node.typeData?.[node.type]?.file_id ?? null
            const file   = files.find(f => f.id === fileId) ?? null
            const fileWithBlob = file && blobMap[file.id] ? { ...file, blobUrl: blobMap[file.id] } : file
            return (
              <PlayerMessage
                key={node.id}
                node={node}
                file={fileWithBlob}
                teacherName={teacherName}
                photoChoiceState={photoChoiceStates[node.id] ?? null}
                onDone={() => onNodeDone(node.id)}
              />
            )
          })}
          {visibleNodes.length === 0 && (
            <p className="playerEmpty">Нод нет — добавь ноды в редакторе</p>
          )}
        </PlayerFeed>
        {wcNode && <ChooseWordPanel node={wcNode} onDone={() => onNodeDone(wcNode.id)} />}
        {paNode && <PhraseAssemblyPanel node={paNode} onDone={() => onNodeDone(paNode.id)} />}
        {pcNode && !photoChoiceStates[pcNode.id] && (
          <PhotoChoicePanel
            node={pcNode}
            onPick={(idx, isCorrect) => handlePhotoPick(pcNode.id, idx, isCorrect)}
          />
        )}
      </div>
      {/* Версия для отслеживания деплоя — fixed, вне потока, pointer-events:none */}
      <div style={{
        position: 'fixed', top: 4, left: '50%', transform: 'translateX(-50%)',
        fontSize: 9, color: 'rgba(255,255,255,0.2)', pointerEvents: 'none',
        zIndex: 9999, userSelect: 'none', whiteSpace: 'nowrap',
      }}>{APP_VERSION}: {(() => { const d = new Date(); return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}.${String(d.getMinutes()).padStart(2,'0')}` })()}</div>
    </>
  )
}
