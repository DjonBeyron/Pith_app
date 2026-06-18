import { useRef } from 'react'
import PlayerTopBar from './PlayerTopBar.jsx'
import PlayerFeed from './PlayerFeed.jsx'
import PlayerMessage from './PlayerMessage.jsx'

export default function LessonPlayer({
  nodes = [], files = [], lessonTitle = '',
  teacherName, teacherLogo, teacherLogoCrop,
  onClose,
}) {
  const feedRef = useRef(null)
  const sorted  = [...nodes].sort((a, b) => a.seq - b.seq)

  return (
    <div className="lessonPlayer">
      <PlayerTopBar
        title={lessonTitle}
        onClose={onClose}
        teacherName={teacherName}
        teacherLogo={teacherLogo}
        teacherLogoCrop={teacherLogoCrop}
      />
      <PlayerFeed ref={feedRef}>
        {sorted.map(node => {
          const fileId = node.typeData?.[node.type]?.file_id ?? null
          const file   = files.find(f => f.id === fileId) ?? null
          return <PlayerMessage key={node.id} node={node} file={file} />
        })}
        {sorted.length === 0 && (
          <p className="playerEmpty">Нод нет — добавь ноды в редакторе</p>
        )}
      </PlayerFeed>
    </div>
  )
}
