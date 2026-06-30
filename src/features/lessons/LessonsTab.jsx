import { useState, useEffect, useRef } from 'react'
import { useCurricula } from './useCurricula.js'
import { useCurriculumLessons } from './useCurriculumLessons.js'
import CurriculaList from './CurriculaList.jsx'
import ModuleGraph from './ModuleGraph.jsx'
import LessonLaunchCard from './LessonLaunchCard.jsx'
import LessonPlayer from '../player/LessonPlayer.jsx'

function CurriculumView({ curriculumId, curriculumTitle, onBack, onOpenCanvas }) {
  const {
    lessons, loading, creating, error,
    bulkCreate, addBeforeFinal, renameLesson, removeLesson,
  } = useCurriculumLessons(curriculumId)

  const [launchId,   setLaunchId]   = useState(null)
  const [playerData, setPlayerData] = useState(null)
  const didInitRef = useRef(false)

  // Auto-create 3 lessons for brand-new empty modules
  useEffect(() => {
    if (!loading && !creating && lessons.length === 0 && !didInitRef.current) {
      didInitRef.current = true
      bulkCreate(['Старт', 'Урок', 'Финал'])
    }
  }, [loading, creating, lessons.length]) // eslint-disable-line react-hooks/exhaustive-deps

  if (playerData) {
    return (
      <LessonPlayer
        nodes={playerData.nodes}
        files={playerData.files}
        lessonTitle={playerData.title}
        teacherName={playerData.teacherName}
        teacherLogo={playerData.teacherLogo}
        teacherLogoCrop={playerData.teacherLogoCrop}
        videoAutoSound={playerData.videoAutoSound ?? false}
        initialBlobMap={playerData.blobMap}
        onClose={() => setPlayerData(null)}
      />
    )
  }

  return (
    <div className="lessonsMapPanel">
      <div className="lessonsMapToolbar">
        <button className="lessonBackBtn" onClick={onBack}>← Модули</button>
        <span className="lessonMapTitle">{curriculumTitle}</span>
        {error && <span className="errorText">{error}</span>}
        <button className="primaryBtn" onClick={() => addBeforeFinal()} disabled={creating || loading}>
          {creating ? '...' : '+ Урок'}
        </button>
      </div>

      {loading || (creating && lessons.length === 0) ? (
        <div className="lessonsHint">Загрузка...</div>
      ) : (
        <ModuleGraph
          lessons={lessons}
          onPlay={id => setLaunchId(id)}
          onEdit={onOpenCanvas}
          onDelete={removeLesson}
          onRename={renameLesson}
        />
      )}

      {launchId && (
        <LessonLaunchCard
          lessonId={launchId}
          onStart={data => { setLaunchId(null); setPlayerData(data) }}
          onClose={() => setLaunchId(null)}
        />
      )}
    </div>
  )
}

const NAV_KEY = 'lessons_nav_v1'
function loadNav() {
  try { return JSON.parse(localStorage.getItem(NAV_KEY) ?? 'null') } catch { return null }
}
function saveNav(val) {
  if (val) localStorage.setItem(NAV_KEY, JSON.stringify(val))
  else localStorage.removeItem(NAV_KEY)
}

export default function LessonsTab({ onOpenCanvas }) {
  const { curricula, createCurriculum, deleteCurriculum, renameCurriculum } = useCurricula()
  const [selected, setSelected] = useState(loadNav) // persisted across tab switches

  function select(c) { setSelected(c); saveNav(c) }
  function deselect() { setSelected(null); saveNav(null) }

  // If the saved curriculum was deleted while on another tab — go back to list
  const stillExists = selected && curricula.some(c => c.id === selected.id)
  if (selected && !stillExists && curricula.length > 0) {
    deselect()
    return null
  }

  if (selected && stillExists) {
    return (
      <CurriculumView
        curriculumId={selected.id}
        curriculumTitle={selected.title}
        onBack={deselect}
        onOpenCanvas={onOpenCanvas}
      />
    )
  }

  return (
    <CurriculaList
      curricula={curricula}
      onCreate={() => { const c = createCurriculum(); select({ id: c.id, title: c.title }) }}
      onOpen={c => select({ id: c.id, title: c.title })}
      onDelete={id => { if (selected?.id === id) deselect(); deleteCurriculum(id) }}
      onRename={renameCurriculum}
    />
  )
}
