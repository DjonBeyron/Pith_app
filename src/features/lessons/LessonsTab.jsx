import { useState } from 'react'
import { useLessons } from './useLessons.js'
import LessonLaunchCard from './LessonLaunchCard.jsx'
import LessonPlayer from '../player/LessonPlayer.jsx'

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export default function LessonsTab({ onOpenCanvas }) {
  const { lessons, loading, creating, error, create, remove } = useLessons({ onOpenCanvas })

  const [launchId,    setLaunchId]    = useState(null)  // which lesson is in the card
  const [playerData,  setPlayerData]  = useState(null)  // data passed from card → player

  function handleStartFromCard(data) {
    setLaunchId(null)
    setPlayerData(data)
  }

  if (playerData) {
    return (
      <LessonPlayer
        nodes={playerData.nodes}
        files={playerData.files}
        lessonTitle={playerData.title}
        teacherName={playerData.teacherName}
        teacherLogo={playerData.teacherLogo}
        teacherLogoCrop={playerData.teacherLogoCrop}
        initialBlobMap={playerData.blobMap}
        onClose={() => setPlayerData(null)}
      />
    )
  }

  return (
    <div className="lessonsPanel">
      <div className="toolbar">
        <button className="primaryBtn" onClick={create} disabled={creating}>
          {creating ? 'Создание...' : '+ Создать урок'}
        </button>
      </div>

      {error && <div className="errorText">{error}</div>}

      {loading ? (
        <div className="lessonsHint">Загрузка...</div>
      ) : lessons.length === 0 ? (
        <div className="lessonsHint">Уроков пока нет. Нажми «Создать урок».</div>
      ) : (
        <div className="lessonsList">
          {lessons.map(l => (
            <div className="lessonRow" key={l.id}>
              <div className="lessonRowMain" onClick={() => onOpenCanvas(l.id)}>
                <span className="lessonTitle">{l.title}</span>
                <span className="lessonDate">{formatDate(l.created_at)}</span>
              </div>
              <button
                className="lessonPlayBtn"
                title="Начать урок"
                onClick={e => { e.stopPropagation(); setLaunchId(l.id) }}
              >
                ▶
              </button>
              <button
                className="lessonDeleteBtn"
                onClick={e => { e.stopPropagation(); remove(l.id) }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {launchId && (
        <LessonLaunchCard
          lessonId={launchId}
          onStart={handleStartFromCard}
          onClose={() => setLaunchId(null)}
        />
      )}
    </div>
  )
}
