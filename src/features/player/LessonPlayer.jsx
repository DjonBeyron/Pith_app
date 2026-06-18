import { useRef, useState } from 'react'
import PlayerTopBar from './PlayerTopBar.jsx'
import PlayerFeed from './PlayerFeed.jsx'
import PlayerMessage from './PlayerMessage.jsx'
import ChooseWordPanel      from './panels/choose-word/ChooseWordPanel.jsx'
import PhraseAssemblyPanel from './panels/phrase-assembly/PhraseAssemblyPanel.jsx'
import PinMessageBanner    from './panels/PinMessageBanner.jsx'
import PhotoChoicePanel    from './panels/photo-choice/PhotoChoicePanel.jsx'

export default function LessonPlayer({
  nodes = [], files = [], lessonTitle = '',
  teacherName, teacherLogo, teacherLogoCrop,
  onClose,
}) {
  const feedRef = useRef(null)
  const sorted  = [...nodes].sort((a, b) => a.seq - b.seq)
  const [photoChoiceStates, setPhotoChoiceStates] = useState({})

  function handlePhotoPick(nodeId, idx, isCorrect) {
    setPhotoChoiceStates(prev => ({ ...prev, [nodeId]: { selected: idx, result: isCorrect ? 'correct' : 'wrong' } }))
  }

  // Show panel for the last node of each interactive type
  const wcNode = sorted.filter(n => n.type === 'word_choice').at(-1)     ?? null
  const paNode = sorted.filter(n => n.type === 'phrase_assembly').at(-1) ?? null
  const pmNode = sorted.filter(n => n.type === 'pin_message').at(-1)     ?? null
  const pcNode = sorted.filter(n => n.type === 'photo_choice').at(-1)   ?? null

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
      <PlayerFeed ref={feedRef}>
        {sorted.map(node => {
          const fileId = node.typeData?.[node.type]?.file_id ?? null
          const file   = files.find(f => f.id === fileId) ?? null
          return <PlayerMessage key={node.id} node={node} file={file} teacherName={teacherName} photoChoiceState={photoChoiceStates[node.id] ?? null} />
        })}
        {sorted.length === 0 && (
          <p className="playerEmpty">Нод нет — добавь ноды в редакторе</p>
        )}
      </PlayerFeed>
      {wcNode && <ChooseWordPanel node={wcNode} />}
      {paNode && <PhraseAssemblyPanel node={paNode} />}
      {pcNode && !photoChoiceStates[pcNode.id] && (
        <PhotoChoicePanel
          node={pcNode}
          onPick={(idx, isCorrect) => handlePhotoPick(pcNode.id, idx, isCorrect)}
        />
      )}
    </div>
  )
}
