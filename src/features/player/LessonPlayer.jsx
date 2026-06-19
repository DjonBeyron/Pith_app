import { useState, useEffect } from 'react'
import PlayerTopBar from './PlayerTopBar.jsx'
import PlayerFeed from './PlayerFeed.jsx'
import PlayerMessage from './PlayerMessage.jsx'
import ChooseWordPanel      from './panels/choose-word/ChooseWordPanel.jsx'
import PhraseAssemblyPanel from './panels/phrase-assembly/PhraseAssemblyPanel.jsx'
import PinMessageBanner    from './panels/PinMessageBanner.jsx'
import PhotoChoicePanel    from './panels/photo-choice/PhotoChoicePanel.jsx'
import { useGraphPlayer }  from './useGraphPlayer.js'
import { getFilesByIds, listFiles } from '../../shared/lib/filesApi.js'
import { pLog }            from '../../shared/lib/debug.js'

export default function LessonPlayer({
  nodes = [], files: propFiles = [], lessonTitle = '',
  teacherName, teacherLogo, teacherLogoCrop,
  onClose,
}) {
  const [files, setFiles] = useState(propFiles)
  const { visibleNodes, isWaiting, onNodeDone } = useGraphPlayer(nodes)

  // On mount: fetch from Supabase any file IDs referenced by nodes but absent from prop files
  useEffect(() => {
    const allIds = [...new Set(nodes.map(n => n.typeData?.[n.type]?.file_id).filter(Boolean))]
    const missing = allIds.filter(id => !propFiles.some(f => f.id === id))
    pLog('LessonPlayer mount: allFileIds=', JSON.stringify(allIds), 'missing=', JSON.stringify(missing))
    if (!missing.length) { setFiles(propFiles); return }
    // Also fetch ALL files from Supabase to compare IDs (debug)
    listFiles().then(all => {
      pLog('Supabase ALL files count=', all.length, 'ids=', all.map(f => f.id).join(','))
    }).catch(() => {})
    getFilesByIds(missing).then(fetched => {
      pLog('LessonPlayer fetched from server:', fetched.map(f => f.id + ' r2=' + (f.r2Url ?? 'null')).join(' | ') || 'none')
      setFiles([...propFiles, ...fetched])
    }).catch(e => pLog('LessonPlayer getFilesByIds ERROR:', e.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [photoChoiceStates, setPhotoChoiceStates] = useState({})

  function handlePhotoPick(nodeId, idx, isCorrect) {
    setPhotoChoiceStates(prev => ({ ...prev, [nodeId]: { selected: idx, result: isCorrect ? 'correct' : 'wrong' } }))
    onNodeDone(nodeId)
  }

  // Show panel for the last VISIBLE node of each interactive type
  const lastOf = (type) => [...visibleNodes].reverse().find(n => n.type === type) ?? null
  const wcNode = lastOf('word_choice')
  const paNode = lastOf('phrase_assembly')
  const pmNode = lastOf('pin_message')
  const pcNode = lastOf('photo_choice')

  return (
    <div className="lessonPlayer">
      <PlayerTopBar
        title={lessonTitle}
        onClose={onClose}
        teacherName={teacherName}
        teacherLogo={teacherLogo}
        teacherLogoCrop={teacherLogoCrop}
      />
      {pmNode && <PinMessageBanner content={pmNode.typeData?.pin_message?.content ?? ''} />}
      <PlayerFeed showDots={isWaiting}>
        {visibleNodes.map(node => {
          const fileId = node.typeData?.[node.type]?.file_id ?? null
          const file   = files.find(f => f.id === fileId) ?? null
          return (
            <PlayerMessage
              key={node.id}
              node={node}
              file={file}
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
  )
}
